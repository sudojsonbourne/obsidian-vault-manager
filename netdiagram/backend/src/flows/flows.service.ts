import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { createHash } from 'crypto';
import { parse as csvParse } from 'csv-parse/sync';
import * as ExcelJS from 'exceljs';
import { FlowRecordEntity } from '../entities/flow-record.entity';
import { InterfaceEntity } from '../entities/interface.entity';

export interface ColumnMapping {
  sourceIP: string;    // column name in CSV/Excel
  destIP: string;
  sourcePort?: string;
  destPort?: string;
  protocol?: string;
  timestamp?: string;
}

export interface LogRow {
  sourceIP: string;
  destIP: string;
  sourcePort?: number;
  destPort?: number;
  protocol?: string;
  timestamp?: string;
}

/**
 * Handles traffic log ingestion, aggregation, and flow-to-device correlation.
 */
@Injectable()
export class FlowsService {
  private readonly logger = new Logger(FlowsService.name);

  constructor(
    @InjectRepository(FlowRecordEntity)
    private readonly flowRepo: Repository<FlowRecordEntity>,
    @InjectRepository(InterfaceEntity)
    private readonly ifaceRepo: Repository<InterfaceEntity>,
    private readonly dataSource: DataSource,
  ) {}

  // ── Ingestion ─────────────────────────────────────────────────────────────

  /**
   * Parse and upsert flow records from a CSV or Excel traffic log file.
   * @param content   Raw file buffer
   * @param filename  Original filename (used to detect format)
   * @param mapping   User-provided column mapping
   */
  async ingestFile(
    content: Buffer,
    filename: string,
    mapping: ColumnMapping,
  ): Promise<{ inserted: number; updated: number }> {
    const rows = await this._parseLogFile(content, filename, mapping);
    return this._upsertFlows(rows);
  }

  /** Parse CSV or Excel into normalized LogRow array */
  private async _parseLogFile(
    content: Buffer,
    filename: string,
    mapping: ColumnMapping,
  ): Promise<LogRow[]> {
    const lower = filename.toLowerCase();
    if (lower.endsWith('.csv') || lower.endsWith('.tsv') || lower.endsWith('.txt')) {
      return this._parseCsv(content, mapping);
    }
    if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
      return this._parseExcel(content, mapping);
    }
    // Try CSV as fallback
    return this._parseCsv(content, mapping);
  }

  private _parseCsv(content: Buffer, mapping: ColumnMapping): LogRow[] {
    const records: any[] = csvParse(content, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
    });

    return records.map((r) => this._mapRecord(r, mapping)).filter(Boolean) as LogRow[];
  }

  private async _parseExcel(
    content: Buffer,
    mapping: ColumnMapping,
  ): Promise<LogRow[]> {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(content as any);
    const sheet = wb.getWorksheet(1);
    if (!sheet) return [];

    const headers: string[] = [];
    sheet.getRow(1).eachCell((cell) => {
      headers.push(String(cell.value || '').trim());
    });

    const rows: LogRow[] = [];
    sheet.eachRow((row, rowNum) => {
      if (rowNum === 1) return;
      const obj: any = {};
      headers.forEach((h, idx) => {
        obj[h] = row.getCell(idx + 1).value;
      });
      const mapped = this._mapRecord(obj, mapping);
      if (mapped) rows.push(mapped);
    });
    return rows;
  }

  private _mapRecord(record: any, mapping: ColumnMapping): LogRow | null {
    const srcIP = String(record[mapping.sourceIP] || '').trim();
    const dstIP = String(record[mapping.destIP] || '').trim();
    if (!srcIP || !dstIP) return null;

    const srcPort = mapping.sourcePort
      ? parseInt(String(record[mapping.sourcePort] || ''), 10) || undefined
      : undefined;
    const dstPort = mapping.destPort
      ? parseInt(String(record[mapping.destPort] || ''), 10) || undefined
      : undefined;
    const protocol = mapping.protocol
      ? String(record[mapping.protocol] || '').trim().toUpperCase() || undefined
      : undefined;
    const timestamp = mapping.timestamp
      ? String(record[mapping.timestamp] || '').trim() || undefined
      : undefined;

    return { sourceIP: srcIP, destIP: dstIP, sourcePort: srcPort, destPort: dstPort, protocol, timestamp };
  }

  // ── Aggregation / Upsert ──────────────────────────────────────────────────

  private async _upsertFlows(
    rows: LogRow[],
  ): Promise<{ inserted: number; updated: number }> {
    let inserted = 0;
    let updated = 0;

    // Batch in chunks of 500 for performance
    const CHUNK = 500;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      const result = await this._upsertChunk(chunk);
      inserted += result.inserted;
      updated += result.updated;
    }

    return { inserted, updated };
  }

  private async _upsertChunk(
    rows: LogRow[],
  ): Promise<{ inserted: number; updated: number }> {
    // Group rows by flowKey; aggregate occurrences and timestamps
    const aggregated = new Map<
      string,
      {
        row: LogRow;
        count: number;
        firstSeen?: Date;
        lastSeen?: Date;
      }
    >();

    for (const row of rows) {
      const key = this._makeFlowKey(row);
      const ts = row.timestamp ? new Date(row.timestamp) : undefined;

      if (aggregated.has(key)) {
        const existing = aggregated.get(key)!;
        existing.count++;
        if (ts) {
          if (!existing.firstSeen || ts < existing.firstSeen)
            existing.firstSeen = ts;
          if (!existing.lastSeen || ts > existing.lastSeen)
            existing.lastSeen = ts;
        }
      } else {
        aggregated.set(key, {
          row,
          count: 1,
          firstSeen: ts,
          lastSeen: ts,
        });
      }
    }

    let inserted = 0;
    let updated = 0;

    // Upsert each unique flow
    for (const [flowKey, agg] of aggregated) {
      const { row, count, firstSeen, lastSeen } = agg;

      const existing = await this.flowRepo.findOne({ where: { flowKey } });

      if (existing) {
        existing.occurrenceCount += count;
        if (firstSeen && (!existing.firstSeen || firstSeen < existing.firstSeen))
          existing.firstSeen = firstSeen;
        if (lastSeen && (!existing.lastSeen || lastSeen > existing.lastSeen))
          existing.lastSeen = lastSeen;
        await this.flowRepo.save(existing);
        updated++;
      } else {
        const entity = this.flowRepo.create({
          flowKey,
          sourceIP: row.sourceIP,
          destIP: row.destIP,
          sourcePort: row.sourcePort,
          destPort: row.destPort,
          protocol: row.protocol,
          occurrenceCount: count,
          firstSeen,
          lastSeen,
        });
        await this.flowRepo.save(entity);
        inserted++;
      }
    }

    return { inserted, updated };
  }

  /** SHA-256 hash of the 5-tuple, used as the dedup key */
  private _makeFlowKey(row: LogRow): string {
    const parts = [
      row.sourceIP,
      row.destIP,
      String(row.sourcePort ?? ''),
      String(row.destPort ?? ''),
      (row.protocol ?? '').toUpperCase(),
    ];
    return createHash('sha256').update(parts.join('|')).digest('hex');
  }

  // ── Correlation ────────────────────────────────────────────────────────────

  /**
   * After parsing device configs, correlate all un-resolved flow records
   * to devices/interfaces via longest-prefix-match on interface subnet table.
   */
  async correlateFlows(): Promise<void> {
    this.logger.log('Starting flow correlation...');

    // Load all interfaces with their IPs
    const allInterfaces = await this.ifaceRepo.find({
      relations: ['device'],
    });

    // Build a flat lookup table: { cidr, prefix, ip, deviceId, interfaceId }
    const ipTable = this._buildIpTable(allInterfaces);

    if (ipTable.length === 0) {
      this.logger.warn('No interface IPs found; skipping correlation.');
      return;
    }

    // Process flows in batches
    const BATCH = 1000;
    let offset = 0;
    let total = 0;

    while (true) {
      const flows = await this.flowRepo.find({
        where: { sourceDeviceId: null },
        take: BATCH,
        skip: offset,
      });

      if (flows.length === 0) break;

      for (const flow of flows) {
        const srcMatch = this._longestPrefixMatch(flow.sourceIP, ipTable);
        const dstMatch = this._longestPrefixMatch(flow.destIP, ipTable);

        flow.sourceDeviceId = srcMatch?.deviceId ?? null;
        flow.sourceInterfaceId = srcMatch?.interfaceId ?? null;
        flow.destDeviceId = dstMatch?.deviceId ?? null;
        flow.destInterfaceId = dstMatch?.interfaceId ?? null;
      }

      await this.flowRepo.save(flows);
      total += flows.length;
      offset += BATCH;

      this.logger.debug(`Correlated ${total} flows so far...`);
    }

    this.logger.log(`Flow correlation complete. Processed ${total} flows.`);
  }

  // ── IP Subnet Matching ────────────────────────────────────────────────────

  private _buildIpTable(
    interfaces: InterfaceEntity[],
  ): Array<{
    networkInt: number;
    prefix: number;
    deviceId: string;
    interfaceId: string;
  }> {
    const table: Array<{
      networkInt: number;
      prefix: number;
      deviceId: string;
      interfaceId: string;
    }> = [];

    for (const iface of interfaces) {
      if (!iface.ips) continue;
      for (const cidr of iface.ips) {
        const parsed = this._parseCidr(cidr);
        if (!parsed) continue;
        table.push({
          networkInt: parsed.networkInt,
          prefix: parsed.prefix,
          deviceId: iface.deviceId,
          interfaceId: iface.id,
        });
      }
    }

    // Sort descending by prefix length for longest-prefix-match
    table.sort((a, b) => b.prefix - a.prefix);
    return table;
  }

  private _longestPrefixMatch(
    ip: string,
    table: Array<{ networkInt: number; prefix: number; deviceId: string; interfaceId: string }>,
  ): { deviceId: string; interfaceId: string } | null {
    const ipInt = this._ipToInt(ip);
    if (ipInt === null) return null;

    for (const entry of table) {
      const mask = entry.prefix === 0 ? 0 : (0xffffffff << (32 - entry.prefix)) >>> 0;
      if ((ipInt & mask) >>> 0 === entry.networkInt >>> 0) {
        return { deviceId: entry.deviceId, interfaceId: entry.interfaceId };
      }
    }
    return null;
  }

  private _parseCidr(
    cidr: string,
  ): { networkInt: number; prefix: number } | null {
    const parts = cidr.split('/');
    if (parts.length !== 2) return null;
    const ipInt = this._ipToInt(parts[0]);
    const prefix = parseInt(parts[1], 10);
    if (ipInt === null || isNaN(prefix) || prefix < 0 || prefix > 32) return null;
    const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
    const networkInt = (ipInt & mask) >>> 0;
    return { networkInt, prefix };
  }

  private _ipToInt(ip: string): number | null {
    const parts = ip.split('.').map(Number);
    if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255))
      return null;
    return (
      ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>>
      0
    );
  }
}
