"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.JuniperParser = void 0;
const common_1 = require("@nestjs/common");
let JuniperParser = class JuniperParser {
    canHandle(filename, content) {
        const lower = filename.toLowerCase();
        if (lower.endsWith('.junos') ||
            lower.endsWith('.juniper') ||
            lower.endsWith('.jnpr')) {
            return true;
        }
        if (lower.endsWith('.txt') || lower.endsWith('.cfg') || lower.endsWith('.conf')) {
            return this._looksLikeJunos(content);
        }
        return false;
    }
    _looksLikeJunos(content) {
        const text = content.slice(0, 2000).toString('utf-8');
        return (/set\s+system\s+host-name/i.test(text) ||
            /^system\s*\{/m.test(text) ||
            /^interfaces\s*\{/m.test(text) ||
            /version\s+[\d.]+[A-Z]/i.test(text));
    }
    async parse(filename, content) {
        const text = content.toString('utf-8');
        const isSetStyle = this._isSetStyle(text);
        if (isSetStyle) {
            return this._parseSetStyle(text);
        }
        return this._parseHierarchical(text);
    }
    _isSetStyle(text) {
        const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
        const setLines = lines.filter((l) => /^\s*set\s+/i.test(l));
        return setLines.length > lines.length * 0.4;
    }
    _parseSetStyle(text) {
        const lines = text.split(/\r?\n/);
        const device = {
            hostname: 'juniper-device',
            vendor: 'juniper',
            interfaces: [],
            properties: {},
        };
        const vlans = [];
        const zoneMap = {};
        for (const raw of lines) {
            const line = raw.trim();
            if (!line.startsWith('set '))
                continue;
            const rest = line.slice(4).trim();
            const hnMatch = rest.match(/^system host-name\s+(\S+)/i);
            if (hnMatch) {
                device.hostname = hnMatch[1];
                continue;
            }
            const modelMatch = rest.match(/^chassis\s+description\s+"?([^"]+)"?/i);
            if (modelMatch) {
                device.model = modelMatch[1].trim();
                continue;
            }
            const verMatch = rest.match(/^version\s+(\S+)/i);
            if (verMatch) {
                device.properties['junosVersion'] = verMatch[1];
                continue;
            }
            const ifIpMatch = rest.match(/^interfaces\s+(\S+)\s+unit\s+(\d+)\s+family\s+inet\s+address\s+(\S+)/i);
            if (ifIpMatch) {
                const ifName = `${ifIpMatch[1]}.${ifIpMatch[2]}`;
                const ip = ifIpMatch[3];
                this._ensureInterface(device, ifName).ips.push(ip);
                continue;
            }
            const ifIp6Match = rest.match(/^interfaces\s+(\S+)\s+unit\s+(\d+)\s+family\s+inet6\s+address\s+(\S+)/i);
            if (ifIp6Match) {
                const ifName = `${ifIp6Match[1]}.${ifIp6Match[2]}`;
                this._ensureInterface(device, ifName).ips.push(ifIp6Match[3]);
                continue;
            }
            const ifDescMatch = rest.match(/^interfaces\s+(\S+)\s+description\s+"?([^"]+)"?/i);
            if (ifDescMatch) {
                this._ensureInterface(device, ifDescMatch[1]).description = ifDescMatch[2].trim();
                continue;
            }
            const ifUnitDescMatch = rest.match(/^interfaces\s+(\S+)\s+unit\s+(\d+)\s+description\s+"?([^"]+)"?/i);
            if (ifUnitDescMatch) {
                const ifName = `${ifUnitDescMatch[1]}.${ifUnitDescMatch[2]}`;
                this._ensureInterface(device, ifName).description = ifUnitDescMatch[3].trim();
                continue;
            }
            const ifSpeedMatch = rest.match(/^interfaces\s+(\S+)\s+speed\s+(\S+)/i);
            if (ifSpeedMatch) {
                const speed = this._normalizeSpeed(ifSpeedMatch[2]);
                this._ensureInterface(device, ifSpeedMatch[1]).speed = speed;
                continue;
            }
            const ifVlanMatch = rest.match(/^interfaces\s+(\S+)\s+unit\s+(\d+)\s+family\s+ethernet-switching\s+vlan\s+members\s+(\S+)/i);
            if (ifVlanMatch) {
                const vlanNum = parseInt(ifVlanMatch[3], 10);
                if (!isNaN(vlanNum)) {
                    const ifName = `${ifVlanMatch[1]}.${ifVlanMatch[2]}`;
                    this._ensureInterface(device, ifName).vlan = vlanNum;
                }
                continue;
            }
            const vlanIdMatch = rest.match(/^vlans\s+(\S+)\s+vlan-id\s+(\d+)/i);
            if (vlanIdMatch) {
                const vid = parseInt(vlanIdMatch[2], 10);
                let vlan = vlans.find((v) => v.id === vid);
                if (!vlan) {
                    vlan = { id: vid, name: vlanIdMatch[1] };
                    vlans.push(vlan);
                }
                else {
                    vlan.name = vlanIdMatch[1];
                }
                continue;
            }
            const staticMatch = rest.match(/^routing-options static route\s+(\S+)\s+next-hop\s+(\S+)/i);
            if (staticMatch) {
                if (!device.properties['staticRoutes'])
                    device.properties['staticRoutes'] = [];
                device.properties['staticRoutes'].push(`${staticMatch[1]} via ${staticMatch[2]}`);
                continue;
            }
            const ospfIfMatch = rest.match(/^protocols ospf area\s+\S+\s+interface\s+(\S+)/i);
            if (ospfIfMatch) {
                if (!device.properties['ospfInterfaces'])
                    device.properties['ospfInterfaces'] = [];
                device.properties['ospfInterfaces'].push(ospfIfMatch[1]);
                continue;
            }
            const bgpAsnMatch = rest.match(/^routing-options autonomous-system\s+(\d+)/i);
            if (bgpAsnMatch) {
                device.properties['bgpAsn'] = parseInt(bgpAsnMatch[1], 10);
                continue;
            }
            const bgpPeerMatch = rest.match(/^protocols bgp group\s+(\S+)\s+neighbor\s+(\S+)\s+peer-as\s+(\d+)/i);
            if (bgpPeerMatch) {
                if (!device.properties['bgpNeighbors'])
                    device.properties['bgpNeighbors'] = [];
                device.properties['bgpNeighbors'].push({
                    group: bgpPeerMatch[1], ip: bgpPeerMatch[2], remoteAs: parseInt(bgpPeerMatch[3], 10),
                });
                continue;
            }
            const zoneIfMatch = rest.match(/^security zones security-zone\s+(\S+)\s+interfaces\s+(\S+)/i);
            if (zoneIfMatch) {
                const zone = zoneIfMatch[1];
                const ifName = zoneIfMatch[2];
                if (!zoneMap[zone])
                    zoneMap[zone] = [];
                zoneMap[zone].push(ifName);
            }
        }
        this._applyZones(device, zoneMap);
        return { devices: [device], connections: [], vlans };
    }
    _parseHierarchical(text) {
        const device = {
            hostname: 'juniper-device',
            vendor: 'juniper',
            interfaces: [],
            properties: {},
        };
        const vlans = [];
        const connections = [];
        const zoneMap = {};
        const tokens = this._tokenize(text);
        const hn = this._get(tokens, ['system', 'host-name']);
        if (hn)
            device.hostname = hn;
        const junosVer = this._get(tokens, ['version']);
        if (junosVer)
            device.properties['junosVersion'] = junosVer;
        const ifacesBlock = this._getBlock(tokens, ['interfaces']);
        if (ifacesBlock) {
            for (const [ifName, ifBlock] of Object.entries(ifacesBlock)) {
                if (typeof ifBlock !== 'object' || ifName === '_value')
                    continue;
                const baseIface = this._ensureInterface(device, ifName);
                if (ifBlock['description'] && ifBlock['description']['_value']) {
                    baseIface.description = ifBlock['description']['_value'];
                }
                if (ifBlock['speed'] && ifBlock['speed']['_value']) {
                    baseIface.speed = this._normalizeSpeed(ifBlock['speed']['_value']);
                }
                if (ifBlock['gigether-options'] || ifBlock['ether-options']) {
                    const opts = ifBlock['gigether-options'] || ifBlock['ether-options'];
                    if (opts['802.3ad'] && opts['802.3ad']['_value']) {
                        baseIface.properties['lagParent'] = opts['802.3ad']['_value'];
                    }
                }
                const unitBlock = ifBlock['unit'];
                if (unitBlock && typeof unitBlock === 'object') {
                    for (const [unitId, unitData] of Object.entries(unitBlock)) {
                        if (typeof unitData !== 'object')
                            continue;
                        const unitIfName = `${ifName}.${unitId}`;
                        const unitIface = this._ensureInterface(device, unitIfName);
                        if (unitData['description']?.['_value']) {
                            unitIface.description = unitData['description']['_value'];
                        }
                        const familyInet = unitData['family']?.['inet'];
                        if (familyInet && familyInet['address']) {
                            const addrs = familyInet['address'];
                            for (const addr of Object.keys(addrs)) {
                                if (addr !== '_value')
                                    unitIface.ips.push(addr);
                            }
                        }
                        const familyInet6 = unitData['family']?.['inet6'];
                        if (familyInet6 && familyInet6['address']) {
                            for (const addr of Object.keys(familyInet6['address'])) {
                                if (addr !== '_value')
                                    unitIface.ips.push(addr);
                            }
                        }
                        const vlanId = unitData['vlan-id']?.['_value'];
                        if (vlanId)
                            unitIface.vlan = parseInt(vlanId, 10);
                        const swVlan = unitData['family']?.['ethernet-switching']?.['vlan']?.['members']?.['_value'];
                        if (swVlan) {
                            const vid = parseInt(swVlan, 10);
                            if (!isNaN(vid))
                                unitIface.vlan = vid;
                        }
                    }
                }
            }
        }
        const vlansBlock = this._getBlock(tokens, ['vlans']);
        if (vlansBlock) {
            for (const [vlanName, vlanData] of Object.entries(vlansBlock)) {
                if (typeof vlanData !== 'object')
                    continue;
                const vlanId = parseInt(vlanData['vlan-id']?.['_value'] ?? '', 10);
                if (!isNaN(vlanId)) {
                    vlans.push({ id: vlanId, name: vlanName });
                }
            }
        }
        const routingBlock = this._getBlock(tokens, ['routing-options']);
        if (routingBlock) {
            const asn = routingBlock['autonomous-system']?.['_value'];
            if (asn)
                device.properties['bgpAsn'] = parseInt(asn, 10);
            const staticBlock = routingBlock['static'];
            if (staticBlock && staticBlock['route']) {
                const routes = [];
                for (const [prefix, routeData] of Object.entries(staticBlock['route'])) {
                    if (typeof routeData !== 'object')
                        continue;
                    const nh = routeData['next-hop']?.['_value'];
                    if (nh)
                        routes.push(`${prefix} via ${nh}`);
                }
                if (routes.length)
                    device.properties['staticRoutes'] = routes;
            }
        }
        const protocolsBlock = this._getBlock(tokens, ['protocols']);
        if (protocolsBlock) {
            const ospfBlock = protocolsBlock['ospf'];
            if (ospfBlock) {
                const ospfIfs = [];
                const areaBlock = ospfBlock['area'];
                if (areaBlock) {
                    for (const [, areaData] of Object.entries(areaBlock)) {
                        if (typeof areaData !== 'object')
                            continue;
                        const ifBlock = areaData['interface'];
                        if (ifBlock) {
                            for (const ifName of Object.keys(ifBlock)) {
                                if (ifName !== '_value')
                                    ospfIfs.push(ifName);
                            }
                        }
                    }
                }
                if (ospfIfs.length)
                    device.properties['ospfInterfaces'] = ospfIfs;
            }
            const bgpBlock = protocolsBlock['bgp'];
            if (bgpBlock && bgpBlock['group']) {
                const neighbors = [];
                for (const [groupName, groupData] of Object.entries(bgpBlock['group'])) {
                    if (typeof groupData !== 'object')
                        continue;
                    const nbrBlock = groupData['neighbor'];
                    if (nbrBlock) {
                        for (const [nbrIp, nbrData] of Object.entries(nbrBlock)) {
                            if (nbrIp === '_value')
                                continue;
                            const peerAs = parseInt(nbrData['peer-as']?.['_value'] ?? '', 10);
                            if (!isNaN(peerAs)) {
                                neighbors.push({ group: groupName, ip: nbrIp, remoteAs: peerAs });
                            }
                        }
                    }
                }
                if (neighbors.length)
                    device.properties['bgpNeighbors'] = neighbors;
            }
            const lldpBlock = protocolsBlock['lldp'];
            if (lldpBlock && lldpBlock['interface']) {
                device.properties['lldpInterfaces'] = Object.keys(lldpBlock['interface']);
            }
        }
        const securityBlock = this._getBlock(tokens, ['security']);
        if (securityBlock && securityBlock['zones']) {
            const zonesBlock = securityBlock['zones'];
            const szBlock = zonesBlock['security-zone'];
            if (szBlock) {
                for (const [zoneName, zoneData] of Object.entries(szBlock)) {
                    if (typeof zoneData !== 'object')
                        continue;
                    const ifBlock = zoneData['interfaces'];
                    if (ifBlock) {
                        zoneMap[zoneName] = Object.keys(ifBlock).filter((k) => k !== '_value');
                    }
                }
            }
        }
        this._applyZones(device, zoneMap);
        return { devices: [device], connections, vlans };
    }
    _tokenize(text) {
        const root = {};
        const stack = [root];
        const keyStack = [];
        const cleaned = text
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/#[^\n]*/g, '');
        for (const line of cleaned.split(/\r?\n/)) {
            const trimmed = line.trim();
            if (!trimmed)
                continue;
            const openMatch = trimmed.match(/^([\w.-]+(?:\s+[\w./:@"-]+)*?)\s*\{$/);
            if (openMatch) {
                const parts = openMatch[1].trim().split(/\s+/);
                let cur = stack[stack.length - 1];
                for (let i = 0; i < parts.length; i++) {
                    const p = parts[i];
                    if (!cur[p])
                        cur[p] = {};
                    if (i < parts.length - 1)
                        cur = cur[p];
                }
                const lastKey = parts[parts.length - 1];
                stack.push(cur[lastKey]);
                keyStack.push(lastKey);
                continue;
            }
            if (trimmed === '}' || trimmed === '};') {
                stack.pop();
                keyStack.pop();
                continue;
            }
            const stmtMatch = trimmed.match(/^([\w.-]+(?:\s+[\w./:@"-]+)*?)\s*;$/);
            if (stmtMatch) {
                const parts = stmtMatch[1].trim().split(/\s+/);
                const cur = stack[stack.length - 1];
                if (parts.length === 1) {
                    if (!cur[parts[0]])
                        cur[parts[0]] = {};
                    cur[parts[0]]['_value'] = true;
                }
                else if (parts.length === 2) {
                    if (!cur[parts[0]])
                        cur[parts[0]] = {};
                    cur[parts[0]]['_value'] = parts[1];
                }
                else {
                    let node = cur;
                    for (let i = 0; i < parts.length - 1; i++) {
                        if (!node[parts[i]])
                            node[parts[i]] = {};
                        node = node[parts[i]];
                    }
                    node['_value'] = parts[parts.length - 1];
                }
                continue;
            }
            const quotedMatch = trimmed.match(/^([\w.-]+)\s+"([^"]*)"(?:\s+[\w.-]+)*\s*;$/);
            if (quotedMatch) {
                const cur = stack[stack.length - 1];
                if (!cur[quotedMatch[1]])
                    cur[quotedMatch[1]] = {};
                cur[quotedMatch[1]]['_value'] = quotedMatch[2];
            }
        }
        return root;
    }
    _get(tokens, path) {
        let cur = tokens;
        for (const key of path) {
            if (!cur || typeof cur !== 'object')
                return undefined;
            cur = cur[key];
        }
        if (cur && typeof cur === 'object' && '_value' in cur) {
            return String(cur['_value']);
        }
        return typeof cur === 'string' ? cur : undefined;
    }
    _getBlock(tokens, path) {
        let cur = tokens;
        for (const key of path) {
            if (!cur || typeof cur !== 'object')
                return undefined;
            cur = cur[key];
        }
        return typeof cur === 'object' ? cur : undefined;
    }
    _ensureInterface(device, name) {
        let iface = device.interfaces.find((i) => i.name === name);
        if (!iface) {
            iface = { name, ips: [], properties: {} };
            device.interfaces.push(iface);
        }
        return iface;
    }
    _applyZones(device, zoneMap) {
        for (const [zone, ifNames] of Object.entries(zoneMap)) {
            for (const ifName of ifNames) {
                const iface = device.interfaces.find((i) => i.name === ifName) ||
                    device.interfaces.find((i) => ifName.startsWith(i.name));
                if (iface)
                    iface.zone = zone;
            }
        }
    }
    _normalizeSpeed(raw) {
        const lower = raw.toLowerCase().trim();
        const map = {
            '10m': '10',
            '100m': '100',
            '1g': '1000',
            '10g': '10000',
            '25g': '25000',
            '40g': '40000',
            '100g': '100000',
            '400g': '400000',
        };
        return map[lower] ?? raw;
    }
};
exports.JuniperParser = JuniperParser;
exports.JuniperParser = JuniperParser = __decorate([
    (0, common_1.Injectable)()
], JuniperParser);
//# sourceMappingURL=juniper.parser.js.map