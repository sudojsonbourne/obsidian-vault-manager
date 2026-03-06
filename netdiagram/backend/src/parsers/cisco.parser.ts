import { Injectable } from '@nestjs/common';
import {
  IParser,
  ParsedConfig,
  ParsedDevice,
  ParsedInterface,
  ParsedVlan,
} from './parser.interface';

/**
 * Parses Cisco IOS / IOS-XE text configuration files.
 * Uses a line-by-line state machine with regex matching.
 *
 * Supported commands:
 *   hostname, interface, ip address, ip address secondary,
 *   description, speed, duplex, switchport access vlan,
 *   switchport trunk allowed vlan, vlan <id>, name,
 *   router ospf, router bgp, ip route
 */
@Injectable()
export class CiscoParser implements IParser {
  canHandle(filename: string, _content: Buffer): boolean {
    const ext = filename.toLowerCase();
    // Treat .txt, .cfg, .conf, .ios files as Cisco unless they are XML
    return (
      (ext.endsWith('.txt') ||
        ext.endsWith('.cfg') ||
        ext.endsWith('.conf') ||
        ext.endsWith('.ios')) &&
      !this._looksLikeXml(_content)
    );
  }

  private _looksLikeXml(content: Buffer): boolean {
    const head = content.slice(0, 100).toString('utf-8').trim();
    return head.startsWith('<') || head.startsWith('<?xml');
  }

  async parse(_filename: string, content: Buffer): Promise<ParsedConfig> {
    const lines = content
      .toString('utf-8')
      .split(/\r?\n/)
      .map((l) => l.trimEnd());

    const device: ParsedDevice = {
      hostname: 'unknown',
      vendor: 'cisco',
      interfaces: [],
      properties: {},
    };

    const vlans: ParsedVlan[] = [];

    // State machine context
    let currentInterface: ParsedInterface | null = null;
    let currentVlan: ParsedVlan | null = null;
    let inRouterOspf = false;
    let inRouterBgp = false;

    const staticRoutes: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();

      // ── Hostname ──────────────────────────────────────────────
      const hostnameMatch = trimmed.match(/^hostname\s+(\S+)/);
      if (hostnameMatch) {
        device.hostname = hostnameMatch[1];
        continue;
      }

      // ── Version / model hints ─────────────────────────────────
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

      // ── Interface block ───────────────────────────────────────
      const ifaceMatch = line.match(/^interface\s+(\S+.*)/i);
      if (ifaceMatch) {
        // Save previous interface
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

        // Extract VLAN from interface name (e.g. Vlan10)
        const vlanNameMatch = ifaceMatch[1].match(/[Vv]lan(\d+)/);
        if (vlanNameMatch) {
          currentInterface.vlan = parseInt(vlanNameMatch[1], 10);
        }
        continue;
      }

      // ── Commands inside an interface block ────────────────────
      if (currentInterface && line.startsWith(' ')) {
        // ip address <ip> <mask> [secondary]
        const ipMatch = trimmed.match(
          /^ip address\s+(\d+\.\d+\.\d+\.\d+)\s+(\d+\.\d+\.\d+\.\d+)/,
        );
        if (ipMatch) {
          const cidr = this._maskToCidr(ipMatch[1], ipMatch[2]);
          currentInterface.ips.push(cidr);
          continue;
        }

        // ipv6 address
        const ipv6Match = trimmed.match(/^ipv6 address\s+(\S+)/);
        if (ipv6Match) {
          currentInterface.ips.push(ipv6Match[1]);
          continue;
        }

        // description
        const descMatch = trimmed.match(/^description\s+(.*)/);
        if (descMatch) {
          currentInterface.description = descMatch[1];
          continue;
        }

        // speed
        const speedMatch = trimmed.match(/^speed\s+(\S+)/);
        if (speedMatch) {
          currentInterface.speed = speedMatch[1];
          continue;
        }

        // duplex
        const duplexMatch = trimmed.match(/^duplex\s+(\S+)/);
        if (duplexMatch) {
          currentInterface.properties['duplex'] = duplexMatch[1];
          continue;
        }

        // switchport access vlan
        const accessVlanMatch = trimmed.match(
          /^switchport access vlan\s+(\d+)/,
        );
        if (accessVlanMatch) {
          currentInterface.vlan = parseInt(accessVlanMatch[1], 10);
          continue;
        }

        // switchport trunk allowed vlan
        const trunkVlanMatch = trimmed.match(
          /^switchport trunk allowed vlan\s+(\S+)/,
        );
        if (trunkVlanMatch) {
          currentInterface.properties['trunkVlans'] = trunkVlanMatch[1];
          continue;
        }

        // shutdown
        if (trimmed === 'shutdown') {
          currentInterface.properties['shutdown'] = true;
          continue;
        }

        // channel-group
        const channelMatch = trimmed.match(/^channel-group\s+(\d+)/);
        if (channelMatch) {
          currentInterface.properties['channelGroup'] = parseInt(
            channelMatch[1],
            10,
          );
          continue;
        }

        continue;
      }

      // ── Leaving interface block ───────────────────────────────
      if (
        currentInterface &&
        !line.startsWith(' ') &&
        trimmed !== '' &&
        !trimmed.startsWith('!')
      ) {
        device.interfaces.push(currentInterface);
        currentInterface = null;
      }

      // ── VLAN block ────────────────────────────────────────────
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
        if (!line.startsWith(' ')) currentVlan = null;
        continue;
      }

      // ── Router OSPF ───────────────────────────────────────────
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

      // ── Router BGP ────────────────────────────────────────────
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

      // ── IP Static Routes ──────────────────────────────────────
      const staticRouteMatch = trimmed.match(
        /^ip route\s+(\d+\.\d+\.\d+\.\d+)\s+(\d+\.\d+\.\d+\.\d+)\s+(\S+)/,
      );
      if (staticRouteMatch) {
        staticRoutes.push(
          `${staticRouteMatch[1]}/${this._maskToPrefix(staticRouteMatch[2])} via ${staticRouteMatch[3]}`,
        );
        continue;
      }

      // ── Reset sub-block state on non-indented non-blank lines ─
      if (!line.startsWith(' ') && trimmed !== '' && !trimmed.startsWith('!')) {
        inRouterOspf = false;
        inRouterBgp = false;
        currentVlan = null;
      }
    }

    // Push last interface if still buffered
    if (currentInterface) {
      device.interfaces.push(currentInterface);
    }

    if (staticRoutes.length) {
      device.properties['staticRoutes'] = staticRoutes;
    }

    return {
      devices: [device],
      connections: [], // Cisco configs don't contain explicit connections
      vlans,
    };
  }

  /** Convert dotted-decimal mask to prefix length integer */
  private _maskToPrefix(mask: string): number {
    return mask
      .split('.')
      .map(Number)
      .reduce((acc, octet) => acc + this._popcount(octet), 0);
  }

  /** Convert IP + mask to CIDR notation */
  private _maskToCidr(ip: string, mask: string): string {
    return `${ip}/${this._maskToPrefix(mask)}`;
  }

  private _popcount(n: number): number {
    let count = 0;
    while (n) {
      count += n & 1;
      n >>= 1;
    }
    return count;
  }
}
