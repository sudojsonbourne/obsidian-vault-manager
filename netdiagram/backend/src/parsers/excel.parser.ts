import { Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import {
  IParser,
  ParsedConfig,
  ParsedDevice,
  ParsedInterface,
  ParsedConnection,
  ParsedVlan,
} from './parser.interface';

/**
 * Parses an Excel workbook with the predefined NetDiagram template.
 *
 * Expected sheets:
 *   1. Devices    — hostname, vendor, model, properties (JSON string)
 *   2. Interfaces — hostname, interfaceName, ips (comma-separated CIDR), speed, vlan, zone, description
 *   3. VLANs      — id, name, subnet
 *   4. Connections — sourceHostname, sourceInterface, targetHostname, targetInterface, vlan, speed
 */
@Injectable()
export class ExcelParser implements IParser {
  canHandle(filename: string, _content: Buffer): boolean {
    const lower = filename.toLowerCase();
    return lower.endsWith('.xlsx') || lower.endsWith('.xls');
  }

  async parse(_filename: string, content: Buffer): Promise<ParsedConfig> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(content as any);

    const devicesMap = new Map<string, ParsedDevice>();
    const connections: ParsedConnection[] = [];
    const vlans: ParsedVlan[] = [];

    // ── Devices sheet ─────────────────────────────────────────────────────
    const devSheet =
      workbook.getWorksheet('Devices') || workbook.getWorksheet(1);
    if (devSheet) {
      const headers = this._getHeaders(devSheet);
      devSheet.eachRow((row, rowNum) => {
        if (rowNum === 1) return; // skip header
        const obj: any = {};
        headers.forEach((h, idx) => {
          obj[h] = this._cellValue(row.getCell(idx + 1));
        });

        if (!obj.hostname) return;
        const dev: ParsedDevice = {
          hostname: String(obj.hostname).trim(),
          vendor: String(obj.vendor || 'unknown').trim().toLowerCase(),
          model: obj.model ? String(obj.model).trim() : undefined,
          interfaces: [],
          properties: obj.properties
            ? this._tryParseJson(obj.properties)
            : {},
        };
        devicesMap.set(dev.hostname, dev);
      });
    }

    // ── Interfaces sheet ──────────────────────────────────────────────────
    const ifaceSheet =
      workbook.getWorksheet('Interfaces') || workbook.getWorksheet(2);
    if (ifaceSheet) {
      const headers = this._getHeaders(ifaceSheet);
      ifaceSheet.eachRow((row, rowNum) => {
        if (rowNum === 1) return;
        const obj: any = {};
        headers.forEach((h, idx) => {
          obj[h] = this._cellValue(row.getCell(idx + 1));
        });

        if (!obj.hostname || !obj.interfaceName) return;
        const hostname = String(obj.hostname).trim();

        // Auto-create device if not in Devices sheet
        if (!devicesMap.has(hostname)) {
          devicesMap.set(hostname, {
            hostname,
            vendor: 'unknown',
            interfaces: [],
            properties: {},
          });
        }

        const dev = devicesMap.get(hostname)!;
        const rawIps = String(obj.ips || '').trim();
        const ips = rawIps
          ? rawIps.split(',').map((s) => s.trim()).filter(Boolean)
          : [];

        const iface: ParsedInterface = {
          name: String(obj.interfaceName).trim(),
          ips,
          speed: obj.speed ? String(obj.speed) : undefined,
          vlan: obj.vlan ? parseInt(String(obj.vlan), 10) : undefined,
          zone: obj.zone ? String(obj.zone).trim() : undefined,
          description: obj.description ? String(obj.description) : undefined,
          properties: obj.properties
            ? this._tryParseJson(obj.properties)
            : {},
        };

        dev.interfaces.push(iface);
      });
    }

    // ── VLANs sheet ───────────────────────────────────────────────────────
    const vlanSheet =
      workbook.getWorksheet('VLANs') || workbook.getWorksheet(3);
    if (vlanSheet) {
      const headers = this._getHeaders(vlanSheet);
      vlanSheet.eachRow((row, rowNum) => {
        if (rowNum === 1) return;
        const obj: any = {};
        headers.forEach((h, idx) => {
          obj[h] = this._cellValue(row.getCell(idx + 1));
        });

        if (obj.id == null) return;
        vlans.push({
          id: parseInt(String(obj.id), 10),
          name: obj.name ? String(obj.name).trim() : undefined,
          subnet: obj.subnet ? String(obj.subnet).trim() : undefined,
        });
      });
    }

    // ── Connections sheet ─────────────────────────────────────────────────
    const connSheet =
      workbook.getWorksheet('Connections') || workbook.getWorksheet(4);
    if (connSheet) {
      const headers = this._getHeaders(connSheet);
      connSheet.eachRow((row, rowNum) => {
        if (rowNum === 1) return;
        const obj: any = {};
        headers.forEach((h, idx) => {
          obj[h] = this._cellValue(row.getCell(idx + 1));
        });

        if (!obj.sourceHostname || !obj.targetHostname) return;
        connections.push({
          sourceHostname: String(obj.sourceHostname).trim(),
          sourceInterface: obj.sourceInterface
            ? String(obj.sourceInterface).trim()
            : undefined,
          targetHostname: String(obj.targetHostname).trim(),
          targetInterface: obj.targetInterface
            ? String(obj.targetInterface).trim()
            : undefined,
          vlan: obj.vlan ? parseInt(String(obj.vlan), 10) : undefined,
          speed: obj.speed ? String(obj.speed) : undefined,
        });
      });
    }

    return {
      devices: Array.from(devicesMap.values()),
      connections,
      vlans,
    };
  }

  /** Extract header row as lowercase trimmed strings */
  private _getHeaders(sheet: ExcelJS.Worksheet): string[] {
    const headers: string[] = [];
    const row = sheet.getRow(1);
    row.eachCell((cell) => {
      headers.push(
        String(cell.value || '').trim().toLowerCase().replace(/\s+/g, '_'),
      );
    });
    return headers;
  }

  private _cellValue(cell: ExcelJS.Cell): any {
    const v = cell.value;
    if (v === null || v === undefined) return null;
    if (typeof v === 'object' && 'text' in v) return (v as any).text;
    if (typeof v === 'object' && 'richText' in v) {
      return (v as any).richText.map((r: any) => r.text).join('');
    }
    return v;
  }

  private _tryParseJson(val: any): Record<string, any> {
    if (typeof val === 'object' && val !== null) return val;
    try {
      return JSON.parse(String(val));
    } catch {
      return {};
    }
  }
}
