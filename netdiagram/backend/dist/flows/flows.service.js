"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var FlowsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.FlowsService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const crypto_1 = require("crypto");
const sync_1 = require("csv-parse/sync");
const ExcelJS = require("exceljs");
const flow_record_entity_1 = require("../entities/flow-record.entity");
const interface_entity_1 = require("../entities/interface.entity");
let FlowsService = FlowsService_1 = class FlowsService {
    constructor(flowRepo, ifaceRepo, dataSource) {
        this.flowRepo = flowRepo;
        this.ifaceRepo = ifaceRepo;
        this.dataSource = dataSource;
        this.logger = new common_1.Logger(FlowsService_1.name);
    }
    async ingestFile(content, filename, mapping) {
        const rows = await this._parseLogFile(content, filename, mapping);
        return this._upsertFlows(rows);
    }
    async _parseLogFile(content, filename, mapping) {
        const lower = filename.toLowerCase();
        if (lower.endsWith('.csv') || lower.endsWith('.tsv') || lower.endsWith('.txt')) {
            return this._parseCsv(content, mapping);
        }
        if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
            return this._parseExcel(content, mapping);
        }
        return this._parseCsv(content, mapping);
    }
    _parseCsv(content, mapping) {
        const records = (0, sync_1.parse)(content, {
            columns: true,
            skip_empty_lines: true,
            trim: true,
            relax_column_count: true,
        });
        return records.map((r) => this._mapRecord(r, mapping)).filter(Boolean);
    }
    async _parseExcel(content, mapping) {
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.load(content);
        const sheet = wb.getWorksheet(1);
        if (!sheet)
            return [];
        const headers = [];
        sheet.getRow(1).eachCell((cell) => {
            headers.push(String(cell.value || '').trim());
        });
        const rows = [];
        sheet.eachRow((row, rowNum) => {
            if (rowNum === 1)
                return;
            const obj = {};
            headers.forEach((h, idx) => {
                obj[h] = row.getCell(idx + 1).value;
            });
            const mapped = this._mapRecord(obj, mapping);
            if (mapped)
                rows.push(mapped);
        });
        return rows;
    }
    _mapRecord(record, mapping) {
        const srcIP = String(record[mapping.sourceIP] || '').trim();
        const dstIP = String(record[mapping.destIP] || '').trim();
        if (!srcIP || !dstIP)
            return null;
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
    async _upsertFlows(rows) {
        let inserted = 0;
        let updated = 0;
        const CHUNK = 500;
        for (let i = 0; i < rows.length; i += CHUNK) {
            const chunk = rows.slice(i, i + CHUNK);
            const result = await this._upsertChunk(chunk);
            inserted += result.inserted;
            updated += result.updated;
        }
        return { inserted, updated };
    }
    async _upsertChunk(rows) {
        const aggregated = new Map();
        for (const row of rows) {
            const key = this._makeFlowKey(row);
            const ts = row.timestamp ? new Date(row.timestamp) : undefined;
            if (aggregated.has(key)) {
                const existing = aggregated.get(key);
                existing.count++;
                if (ts) {
                    if (!existing.firstSeen || ts < existing.firstSeen)
                        existing.firstSeen = ts;
                    if (!existing.lastSeen || ts > existing.lastSeen)
                        existing.lastSeen = ts;
                }
            }
            else {
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
            }
            else {
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
    _makeFlowKey(row) {
        const parts = [
            row.sourceIP,
            row.destIP,
            String(row.sourcePort ?? ''),
            String(row.destPort ?? ''),
            (row.protocol ?? '').toUpperCase(),
        ];
        return (0, crypto_1.createHash)('sha256').update(parts.join('|')).digest('hex');
    }
    async correlateFlows() {
        this.logger.log('Starting flow correlation...');
        const allInterfaces = await this.ifaceRepo.find({
            relations: ['device'],
        });
        const ipTable = this._buildIpTable(allInterfaces);
        if (ipTable.length === 0) {
            this.logger.warn('No interface IPs found; skipping correlation.');
            return;
        }
        const BATCH = 1000;
        let offset = 0;
        let total = 0;
        while (true) {
            const flows = await this.flowRepo.find({
                where: { sourceDeviceId: null },
                take: BATCH,
                skip: offset,
            });
            if (flows.length === 0)
                break;
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
    _buildIpTable(interfaces) {
        const table = [];
        for (const iface of interfaces) {
            if (!iface.ips)
                continue;
            for (const cidr of iface.ips) {
                const parsed = this._parseCidr(cidr);
                if (!parsed)
                    continue;
                table.push({
                    networkInt: parsed.networkInt,
                    prefix: parsed.prefix,
                    deviceId: iface.deviceId,
                    interfaceId: iface.id,
                });
            }
        }
        table.sort((a, b) => b.prefix - a.prefix);
        return table;
    }
    _longestPrefixMatch(ip, table) {
        const ipInt = this._ipToInt(ip);
        if (ipInt === null)
            return null;
        for (const entry of table) {
            const mask = entry.prefix === 0 ? 0 : (0xffffffff << (32 - entry.prefix)) >>> 0;
            if ((ipInt & mask) >>> 0 === entry.networkInt >>> 0) {
                return { deviceId: entry.deviceId, interfaceId: entry.interfaceId };
            }
        }
        return null;
    }
    _parseCidr(cidr) {
        const parts = cidr.split('/');
        if (parts.length !== 2)
            return null;
        const ipInt = this._ipToInt(parts[0]);
        const prefix = parseInt(parts[1], 10);
        if (ipInt === null || isNaN(prefix) || prefix < 0 || prefix > 32)
            return null;
        const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
        const networkInt = (ipInt & mask) >>> 0;
        return { networkInt, prefix };
    }
    _ipToInt(ip) {
        const parts = ip.split('.').map(Number);
        if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255))
            return null;
        return (((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>>
            0);
    }
};
exports.FlowsService = FlowsService;
exports.FlowsService = FlowsService = FlowsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(flow_record_entity_1.FlowRecordEntity)),
    __param(1, (0, typeorm_1.InjectRepository)(interface_entity_1.InterfaceEntity)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.DataSource])
], FlowsService);
//# sourceMappingURL=flows.service.js.map