"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CiscoParser = void 0;
const common_1 = require("@nestjs/common");
let CiscoParser = class CiscoParser {
    canHandle(filename, _content) {
        const ext = filename.toLowerCase();
        return ((ext.endsWith('.txt') ||
            ext.endsWith('.cfg') ||
            ext.endsWith('.conf') ||
            ext.endsWith('.ios')) &&
            !this._looksLikeXml(_content));
    }
    _looksLikeXml(content) {
        const head = content.slice(0, 100).toString('utf-8').trim();
        return head.startsWith('<') || head.startsWith('<?xml');
    }
    async parse(_filename, content) {
        const lines = content
            .toString('utf-8')
            .split(/\r?\n/)
            .map((l) => l.trimEnd());
        const device = {
            hostname: 'unknown',
            vendor: 'cisco',
            interfaces: [],
            properties: {},
        };
        const vlans = [];
        let currentInterface = null;
        let currentVlan = null;
        let inRouterOspf = false;
        let inRouterBgp = false;
        const staticRoutes = [];
        for (const line of lines) {
            const trimmed = line.trim();
            const hostnameMatch = trimmed.match(/^hostname\s+(\S+)/);
            if (hostnameMatch) {
                device.hostname = hostnameMatch[1];
                continue;
            }
            const versionMatch = trimmed.match(/^version\s+(.+)/i);
            if (versionMatch) {
                device.properties['iosVersion'] = versionMatch[1];
                continue;
            }
            const modelMatch = trimmed.match(/^Model Number\s*:\s*(.+)/i);
            if (modelMatch) {
                device.model = modelMatch[1].trim();
                continue;
            }
            const ifaceMatch = line.match(/^interface\s+(\S+.*)/i);
            if (ifaceMatch) {
                if (currentInterface) {
                    device.interfaces.push(currentInterface);
                }
                currentVlan = null;
                inRouterOspf = false;
                inRouterBgp = false;
                currentInterface = {
                    name: ifaceMatch[1].trim(),
                    ips: [],
                    properties: {},
                };
                const vlanNameMatch = ifaceMatch[1].match(/[Vv]lan(\d+)/);
                if (vlanNameMatch) {
                    currentInterface.vlan = parseInt(vlanNameMatch[1], 10);
                }
                continue;
            }
            if (currentInterface && line.startsWith(' ')) {
                const ipMatch = trimmed.match(/^ip address\s+(\d+\.\d+\.\d+\.\d+)\s+(\d+\.\d+\.\d+\.\d+)/);
                if (ipMatch) {
                    const cidr = this._maskToCidr(ipMatch[1], ipMatch[2]);
                    currentInterface.ips.push(cidr);
                    continue;
                }
                const ipv6Match = trimmed.match(/^ipv6 address\s+(\S+)/);
                if (ipv6Match) {
                    currentInterface.ips.push(ipv6Match[1]);
                    continue;
                }
                const descMatch = trimmed.match(/^description\s+(.*)/);
                if (descMatch) {
                    currentInterface.description = descMatch[1];
                    continue;
                }
                const speedMatch = trimmed.match(/^speed\s+(\S+)/);
                if (speedMatch) {
                    currentInterface.speed = speedMatch[1];
                    continue;
                }
                const duplexMatch = trimmed.match(/^duplex\s+(\S+)/);
                if (duplexMatch) {
                    currentInterface.properties['duplex'] = duplexMatch[1];
                    continue;
                }
                const accessVlanMatch = trimmed.match(/^switchport access vlan\s+(\d+)/);
                if (accessVlanMatch) {
                    currentInterface.vlan = parseInt(accessVlanMatch[1], 10);
                    continue;
                }
                const trunkVlanMatch = trimmed.match(/^switchport trunk allowed vlan\s+(\S+)/);
                if (trunkVlanMatch) {
                    currentInterface.properties['trunkVlans'] = trunkVlanMatch[1];
                    continue;
                }
                if (trimmed === 'shutdown') {
                    currentInterface.properties['shutdown'] = true;
                    continue;
                }
                const channelMatch = trimmed.match(/^channel-group\s+(\d+)/);
                if (channelMatch) {
                    currentInterface.properties['channelGroup'] = parseInt(channelMatch[1], 10);
                    continue;
                }
                continue;
            }
            if (currentInterface &&
                !line.startsWith(' ') &&
                trimmed !== '' &&
                !trimmed.startsWith('!')) {
                device.interfaces.push(currentInterface);
                currentInterface = null;
            }
            const vlanBlockMatch = trimmed.match(/^vlan\s+(\d+)$/);
            if (vlanBlockMatch) {
                currentVlan = {
                    id: parseInt(vlanBlockMatch[1], 10),
                };
                vlans.push(currentVlan);
                continue;
            }
            if (currentVlan && trimmed.match(/^name\s+(.+)/)) {
                currentVlan.name = trimmed.replace(/^name\s+/, '').trim();
                if (!line.startsWith(' '))
                    currentVlan = null;
                continue;
            }
            if (trimmed.match(/^router ospf\s+\d+/i)) {
                inRouterOspf = true;
                inRouterBgp = false;
                continue;
            }
            if (inRouterOspf && line.startsWith(' ')) {
                const neighborMatch = trimmed.match(/^neighbor\s+(\S+)/);
                if (neighborMatch) {
                    if (!device.properties['ospfNeighbors'])
                        device.properties['ospfNeighbors'] = [];
                    device.properties['ospfNeighbors'].push(neighborMatch[1]);
                }
                continue;
            }
            if (trimmed.match(/^router bgp\s+(\d+)/i)) {
                const asMatch = trimmed.match(/^router bgp\s+(\d+)/i);
                device.properties['bgpAsn'] = asMatch ? parseInt(asMatch[1], 10) : null;
                inRouterBgp = true;
                inRouterOspf = false;
                continue;
            }
            if (inRouterBgp && line.startsWith(' ')) {
                const neighborMatch = trimmed.match(/^neighbor\s+(\S+)\s+remote-as\s+(\d+)/i);
                if (neighborMatch) {
                    if (!device.properties['bgpNeighbors'])
                        device.properties['bgpNeighbors'] = [];
                    device.properties['bgpNeighbors'].push({
                        ip: neighborMatch[1],
                        remoteAs: parseInt(neighborMatch[2], 10),
                    });
                }
                continue;
            }
            const staticRouteMatch = trimmed.match(/^ip route\s+(\d+\.\d+\.\d+\.\d+)\s+(\d+\.\d+\.\d+\.\d+)\s+(\S+)/);
            if (staticRouteMatch) {
                staticRoutes.push(`${staticRouteMatch[1]}/${this._maskToPrefix(staticRouteMatch[2])} via ${staticRouteMatch[3]}`);
                continue;
            }
            if (!line.startsWith(' ') && trimmed !== '' && !trimmed.startsWith('!')) {
                inRouterOspf = false;
                inRouterBgp = false;
                currentVlan = null;
            }
        }
        if (currentInterface) {
            device.interfaces.push(currentInterface);
        }
        if (staticRoutes.length) {
            device.properties['staticRoutes'] = staticRoutes;
        }
        return {
            devices: [device],
            connections: [],
            vlans,
        };
    }
    _maskToPrefix(mask) {
        return mask
            .split('.')
            .map(Number)
            .reduce((acc, octet) => acc + this._popcount(octet), 0);
    }
    _maskToCidr(ip, mask) {
        return `${ip}/${this._maskToPrefix(mask)}`;
    }
    _popcount(n) {
        let count = 0;
        while (n) {
            count += n & 1;
            n >>= 1;
        }
        return count;
    }
};
exports.CiscoParser = CiscoParser;
exports.CiscoParser = CiscoParser = __decorate([
    (0, common_1.Injectable)()
], CiscoParser);
//# sourceMappingURL=cisco.parser.js.map