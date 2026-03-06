"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExcelParser = void 0;
const common_1 = require("@nestjs/common");
const ExcelJS = require("exceljs");
let ExcelParser = class ExcelParser {
    canHandle(filename, _content) {
        const lower = filename.toLowerCase();
        return lower.endsWith('.xlsx') || lower.endsWith('.xls');
    }
    async parse(_filename, content) {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(content);
        const devicesMap = new Map();
        const connections = [];
        const vlans = [];
        const devSheet = workbook.getWorksheet('Devices') || workbook.getWorksheet(1);
        if (devSheet) {
            const headers = this._getHeaders(devSheet);
            devSheet.eachRow((row, rowNum) => {
                if (rowNum === 1)
                    return;
                const obj = {};
                headers.forEach((h, idx) => {
                    obj[h] = this._cellValue(row.getCell(idx + 1));
                });
                if (!obj.hostname)
                    return;
                const dev = {
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
        const ifaceSheet = workbook.getWorksheet('Interfaces') || workbook.getWorksheet(2);
        if (ifaceSheet) {
            const headers = this._getHeaders(ifaceSheet);
            ifaceSheet.eachRow((row, rowNum) => {
                if (rowNum === 1)
                    return;
                const obj = {};
                headers.forEach((h, idx) => {
                    obj[h] = this._cellValue(row.getCell(idx + 1));
                });
                if (!obj.hostname || !obj.interfaceName)
                    return;
                const hostname = String(obj.hostname).trim();
                if (!devicesMap.has(hostname)) {
                    devicesMap.set(hostname, {
                        hostname,
                        vendor: 'unknown',
                        interfaces: [],
                        properties: {},
                    });
                }
                const dev = devicesMap.get(hostname);
                const rawIps = String(obj.ips || '').trim();
                const ips = rawIps
                    ? rawIps.split(',').map((s) => s.trim()).filter(Boolean)
                    : [];
                const iface = {
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
        const vlanSheet = workbook.getWorksheet('VLANs') || workbook.getWorksheet(3);
        if (vlanSheet) {
            const headers = this._getHeaders(vlanSheet);
            vlanSheet.eachRow((row, rowNum) => {
                if (rowNum === 1)
                    return;
                const obj = {};
                headers.forEach((h, idx) => {
                    obj[h] = this._cellValue(row.getCell(idx + 1));
                });
                if (obj.id == null)
                    return;
                vlans.push({
                    id: parseInt(String(obj.id), 10),
                    name: obj.name ? String(obj.name).trim() : undefined,
                    subnet: obj.subnet ? String(obj.subnet).trim() : undefined,
                });
            });
        }
        const connSheet = workbook.getWorksheet('Connections') || workbook.getWorksheet(4);
        if (connSheet) {
            const headers = this._getHeaders(connSheet);
            connSheet.eachRow((row, rowNum) => {
                if (rowNum === 1)
                    return;
                const obj = {};
                headers.forEach((h, idx) => {
                    obj[h] = this._cellValue(row.getCell(idx + 1));
                });
                if (!obj.sourceHostname || !obj.targetHostname)
                    return;
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
    _getHeaders(sheet) {
        const headers = [];
        const row = sheet.getRow(1);
        row.eachCell((cell) => {
            headers.push(String(cell.value || '').trim().toLowerCase().replace(/\s+/g, '_'));
        });
        return headers;
    }
    _cellValue(cell) {
        const v = cell.value;
        if (v === null || v === undefined)
            return null;
        if (typeof v === 'object' && 'text' in v)
            return v.text;
        if (typeof v === 'object' && 'richText' in v) {
            return v.richText.map((r) => r.text).join('');
        }
        return v;
    }
    _tryParseJson(val) {
        if (typeof val === 'object' && val !== null)
            return val;
        try {
            return JSON.parse(String(val));
        }
        catch {
            return {};
        }
    }
};
exports.ExcelParser = ExcelParser;
exports.ExcelParser = ExcelParser = __decorate([
    (0, common_1.Injectable)()
], ExcelParser);
//# sourceMappingURL=excel.parser.js.map