"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaloAltoParser = void 0;
const common_1 = require("@nestjs/common");
const xml2js_1 = require("xml2js");
let PaloAltoParser = class PaloAltoParser {
    canHandle(filename, content) {
        const lower = filename.toLowerCase();
        if (lower.endsWith('.xml') || lower.endsWith('.json'))
            return true;
        const head = content.slice(0, 200).toString('utf-8').trim();
        return (head.startsWith('<?xml') || head.startsWith('<config') || head.startsWith('<response'));
    }
    async parse(filename, content) {
        const lower = filename.toLowerCase();
        if (lower.endsWith('.json')) {
            return this._parseJson(content);
        }
        return this._parseXml(content);
    }
    async _parseXml(content) {
        const xml = await (0, xml2js_1.parseStringPromise)(content.toString('utf-8'), {
            explicitArray: true,
            mergeAttrs: false,
        });
        const device = {
            hostname: 'paloalto-fw',
            vendor: 'paloalto',
            interfaces: [],
            properties: {},
        };
        const config = xml?.config || xml?.response?.result?.[0]?.config?.[0] || xml;
        try {
            const sysInfo = config?.devices?.[0]?.entry?.[0]?.deviceconfig?.[0]?.system?.[0];
            if (sysInfo?.hostname?.[0]) {
                device.hostname = sysInfo.hostname[0];
            }
        }
        catch (_) { }
        try {
            const networkIface = config?.devices?.[0]?.entry?.[0]?.network?.[0]?.interface?.[0];
            if (networkIface) {
                const ethEntries = networkIface?.ethernet?.[0]?.entry || [];
                for (const eth of ethEntries) {
                    const ifaceName = eth?.$?.name || 'eth-unknown';
                    const parsed = this._parseEthernetEntry(ifaceName, eth);
                    device.interfaces.push(...parsed);
                }
                const loopEntries = networkIface?.loopback?.[0]?.units?.[0]?.entry || [];
                for (const lo of loopEntries) {
                    const iface = this._parseUnitEntry(lo?.$?.name || 'loopback', lo);
                    device.interfaces.push(iface);
                }
                const tunnelEntries = networkIface?.tunnel?.[0]?.units?.[0]?.entry || [];
                for (const tun of tunnelEntries) {
                    const iface = this._parseUnitEntry(tun?.$?.name || 'tunnel', tun);
                    device.interfaces.push(iface);
                }
            }
        }
        catch (err) {
            device.properties['parseError'] = String(err);
        }
        try {
            const vsysEntries = config?.devices?.[0]?.entry?.[0]?.vsys?.[0]?.entry || [];
            for (const vsys of vsysEntries) {
                const zoneEntries = vsys?.zone?.[0]?.entry || [];
                for (const zone of zoneEntries) {
                    const zoneName = zone?.$?.name;
                    const members = zone?.network?.[0]?.layer3?.[0]?.member || [];
                    for (const memberName of members) {
                        const iface = device.interfaces.find((i) => i.name === memberName || i.name.startsWith(memberName + '.'));
                        if (iface)
                            iface.zone = zoneName;
                    }
                }
            }
        }
        catch (_) { }
        return {
            devices: [device],
            connections: [],
            vlans: [],
        };
    }
    _parseEthernetEntry(name, eth) {
        const results = [];
        const units = eth?.layer3?.[0]?.units?.[0]?.entry;
        if (units && units.length > 0) {
            for (const unit of units) {
                results.push(this._parseUnitEntry(unit?.$?.name || name, unit));
            }
            return results;
        }
        const layer3 = eth?.layer3?.[0];
        if (layer3) {
            const iface = {
                name,
                ips: this._extractIps(layer3),
                properties: {},
            };
            results.push(iface);
            return results;
        }
        results.push({ name, ips: [], properties: { mode: 'layer2-or-ha' } });
        return results;
    }
    _parseUnitEntry(name, unit) {
        return {
            name,
            ips: this._extractIps(unit),
            description: unit?.comment?.[0] || undefined,
            vlan: unit?.tag?.[0] ? parseInt(unit.tag[0], 10) : undefined,
            properties: {},
        };
    }
    _extractIps(node) {
        if (!node)
            return [];
        const ips = [];
        const ipEntries = node?.ip?.[0]?.entry;
        if (ipEntries) {
            for (const e of ipEntries) {
                if (e?.$?.name)
                    ips.push(e.$.name);
            }
        }
        if (node?.['ip-address']?.[0]) {
            const ip = node['ip-address'][0];
            const prefix = node['prefix-len']?.[0] ||
                (node['netmask']?.[0]
                    ? this._maskToPrefix(node['netmask'][0])
                    : '32');
            ips.push(`${ip}/${prefix}`);
        }
        return ips;
    }
    async _parseJson(content) {
        const obj = JSON.parse(content.toString('utf-8'));
        const device = {
            hostname: obj?.hostname || obj?.system?.hostname || 'paloalto-fw',
            vendor: 'paloalto',
            interfaces: [],
            properties: {},
        };
        const interfaces = obj?.interfaces || obj?.network?.interfaces || [];
        for (const iface of interfaces) {
            device.interfaces.push({
                name: iface.name || 'unknown',
                ips: iface.ips || iface.ipAddresses || [],
                speed: iface.speed,
                zone: iface.zone,
                description: iface.description || iface.comment,
                properties: {},
            });
        }
        return { devices: [device], connections: [], vlans: [] };
    }
    _maskToPrefix(mask) {
        return mask
            .split('.')
            .map(Number)
            .reduce((acc, octet) => acc +
            octet
                .toString(2)
                .split('')
                .filter((b) => b === '1').length, 0);
    }
};
exports.PaloAltoParser = PaloAltoParser;
exports.PaloAltoParser = PaloAltoParser = __decorate([
    (0, common_1.Injectable)()
], PaloAltoParser);
//# sourceMappingURL=paloalto.parser.js.map