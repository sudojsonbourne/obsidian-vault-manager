import { Injectable } from '@nestjs/common';
import { parseStringPromise } from 'xml2js';
import {
  IParser,
  ParsedConfig,
  ParsedDevice,
  ParsedInterface,
} from './parser.interface';

/**
 * Parses Palo Alto Networks firewall configuration in XML or JSON format.
 *
 * XML path of interest:
 *   /config/devices/entry[@name='localhost.localdomain']/
 *     network/interface/ethernet/entry[@name='ethernetX/Y']/
 *       layer3/units/entry or ip/entry
 *   /config/devices/entry/vsys/entry/zone/entry/network/layer3/member
 */
@Injectable()
export class PaloAltoParser implements IParser {
  canHandle(filename: string, content: Buffer): boolean {
    const lower = filename.toLowerCase();
    if (lower.endsWith('.xml') || lower.endsWith('.json')) return true;
    // Detect XML content sniffing for files with .txt extension
    const head = content.slice(0, 200).toString('utf-8').trim();
    return (
      head.startsWith('<?xml') || head.startsWith('<config') || head.startsWith('<response')
    );
  }

  async parse(filename: string, content: Buffer): Promise<ParsedConfig> {
    const lower = filename.toLowerCase();

    if (lower.endsWith('.json')) {
      return this._parseJson(content);
    }
    return this._parseXml(content);
  }

  // ── XML Parsing ───────────────────────────────────────────────────────────

  private async _parseXml(content: Buffer): Promise<ParsedConfig> {
    const xml = await parseStringPromise(content.toString('utf-8'), {
      explicitArray: true,
      mergeAttrs: false,
    });

    const device: ParsedDevice = {
      hostname: 'paloalto-fw',
      vendor: 'paloalto',
      interfaces: [],
      properties: {},
    };

    // Navigate to the config root
    const config = xml?.config || xml?.response?.result?.[0]?.config?.[0] || xml;

    // ── Hostname ──────────────────────────────────────────────────────────
    try {
      const sysInfo =
        config?.devices?.[0]?.entry?.[0]?.deviceconfig?.[0]?.system?.[0];
      if (sysInfo?.hostname?.[0]) {
        device.hostname = sysInfo.hostname[0];
      }
    } catch (_) {/* ignore */}

    // ── Interfaces ────────────────────────────────────────────────────────
    try {
      const networkIface =
        config?.devices?.[0]?.entry?.[0]?.network?.[0]?.interface?.[0];

      if (networkIface) {
        // Ethernet interfaces
        const ethEntries = networkIface?.ethernet?.[0]?.entry || [];
        for (const eth of ethEntries) {
          const ifaceName: string = eth?.$?.name || 'eth-unknown';
          const parsed = this._parseEthernetEntry(ifaceName, eth);
          device.interfaces.push(...parsed);
        }

        // Loopback interfaces
        const loopEntries = networkIface?.loopback?.[0]?.units?.[0]?.entry || [];
        for (const lo of loopEntries) {
          const iface = this._parseUnitEntry(lo?.$?.name || 'loopback', lo);
          device.interfaces.push(iface);
        }

        // Tunnel interfaces
        const tunnelEntries =
          networkIface?.tunnel?.[0]?.units?.[0]?.entry || [];
        for (const tun of tunnelEntries) {
          const iface = this._parseUnitEntry(tun?.$?.name || 'tunnel', tun);
          device.interfaces.push(iface);
        }
      }
    } catch (err) {
      device.properties['parseError'] = String(err);
    }

    // ── Zones ─────────────────────────────────────────────────────────────
    try {
      const vsysEntries =
        config?.devices?.[0]?.entry?.[0]?.vsys?.[0]?.entry || [];
      for (const vsys of vsysEntries) {
        const zoneEntries = vsys?.zone?.[0]?.entry || [];
        for (const zone of zoneEntries) {
          const zoneName: string = zone?.$?.name;
          const members: string[] =
            zone?.network?.[0]?.layer3?.[0]?.member || [];
          // Tag interfaces with their zone
          for (const memberName of members) {
            const iface = device.interfaces.find(
              (i) =>
                i.name === memberName || i.name.startsWith(memberName + '.'),
            );
            if (iface) iface.zone = zoneName;
          }
        }
      }
    } catch (_) {/* ignore */}

    return {
      devices: [device],
      connections: [],
      vlans: [],
    };
  }

  /** Handle an ethernet entry which may have layer3 sub-interfaces (units) or a direct IP */
  private _parseEthernetEntry(
    name: string,
    eth: any,
  ): ParsedInterface[] {
    const results: ParsedInterface[] = [];

    // Layer3 with sub-interfaces (units)
    const units = eth?.layer3?.[0]?.units?.[0]?.entry;
    if (units && units.length > 0) {
      for (const unit of units) {
        results.push(this._parseUnitEntry(unit?.$?.name || name, unit));
      }
      return results;
    }

    // Layer3 direct
    const layer3 = eth?.layer3?.[0];
    if (layer3) {
      const iface: ParsedInterface = {
        name,
        ips: this._extractIps(layer3),
        properties: {},
      };
      results.push(iface);
      return results;
    }

    // Layer2 / HA / other — still record the interface without IPs
    results.push({ name, ips: [], properties: { mode: 'layer2-or-ha' } });
    return results;
  }

  private _parseUnitEntry(name: string, unit: any): ParsedInterface {
    return {
      name,
      ips: this._extractIps(unit),
      description: unit?.comment?.[0] || undefined,
      vlan: unit?.tag?.[0] ? parseInt(unit.tag[0], 10) : undefined,
      properties: {},
    };
  }

  /** Extract IPs from a PAN XML node that may have ip/entry or ip-address children */
  private _extractIps(node: any): string[] {
    if (!node) return [];
    const ips: string[] = [];

    // Format 1: <ip><entry name="10.0.0.1/24"/></ip>
    const ipEntries = node?.ip?.[0]?.entry;
    if (ipEntries) {
      for (const e of ipEntries) {
        if (e?.$?.name) ips.push(e.$.name);
      }
    }

    // Format 2: <ip-address>10.0.0.1</ip-address> with <netmask> or <prefix-len>
    if (node?.['ip-address']?.[0]) {
      const ip = node['ip-address'][0];
      const prefix =
        node['prefix-len']?.[0] ||
        (node['netmask']?.[0]
          ? this._maskToPrefix(node['netmask'][0])
          : '32');
      ips.push(`${ip}/${prefix}`);
    }

    return ips;
  }

  // ── JSON Parsing ──────────────────────────────────────────────────────────

  private async _parseJson(content: Buffer): Promise<ParsedConfig> {
    const obj = JSON.parse(content.toString('utf-8'));

    const device: ParsedDevice = {
      hostname: obj?.hostname || obj?.system?.hostname || 'paloalto-fw',
      vendor: 'paloalto',
      interfaces: [],
      properties: {},
    };

    const interfaces: any[] = obj?.interfaces || obj?.network?.interfaces || [];
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

  private _maskToPrefix(mask: string): number {
    return mask
      .split('.')
      .map(Number)
      .reduce(
        (acc, octet) =>
          acc +
          octet
            .toString(2)
            .split('')
            .filter((b) => b === '1').length,
        0,
      );
  }
}
