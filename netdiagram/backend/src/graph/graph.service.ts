import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { DeviceEntity } from '../entities/device.entity';
import { InterfaceEntity } from '../entities/interface.entity';
import { ConnectionEntity } from '../entities/connection.entity';
import { FlowRecordEntity } from '../entities/flow-record.entity';
import { VlanEntity } from '../entities/vlan.entity';
import { ParsedConfig, ParsedDevice, ParsedConnection, ParsedVlan } from '../parsers/parser.interface';

export interface FilterCriteria {
  interface?: string;      // filter by interface name substring
  zone?: string;           // filter by zone name
  ip?: string;             // filter flows involving this IP
  protocol?: string;       // filter by protocol (TCP, UDP, etc.)
  port?: number;           // filter by destination port
  minOccurrences?: number; // minimum flow occurrence count
  showAllEdges?: boolean;  // if true, show all connections between matched devices
}

export interface GraphNode {
  id: string;
  hostname: string;
  vendor: string;
  model?: string;
  interfaces: Array<{
    id: string;
    name: string;
    ips: string[];
    speed?: string;
    vlan?: number;
    zone?: string;
    description?: string;
  }>;
  properties: Record<string, any>;
}

export interface GraphEdge {
  id: string;
  sourceDeviceId: string;
  targetDeviceId: string;
  sourceInterfaceId?: string;
  targetInterfaceId?: string;
  connectionType: string;
  vlan?: number;
  speed?: string;
  // Flow aggregation data (populated when filtering)
  totalOccurrences?: number;
  protocols?: string[];
  ports?: number[];
  flowCount?: number;
  label?: string;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/**
 * Builds the device graph from parsed configs and handles graph queries + filtering.
 */
@Injectable()
export class GraphService {
  private readonly logger = new Logger(GraphService.name);

  constructor(
    @InjectRepository(DeviceEntity)
    private readonly deviceRepo: Repository<DeviceEntity>,
    @InjectRepository(InterfaceEntity)
    private readonly ifaceRepo: Repository<InterfaceEntity>,
    @InjectRepository(ConnectionEntity)
    private readonly connRepo: Repository<ConnectionEntity>,
    @InjectRepository(FlowRecordEntity)
    private readonly flowRepo: Repository<FlowRecordEntity>,
    @InjectRepository(VlanEntity)
    private readonly vlanRepo: Repository<VlanEntity>,
  ) {}

  // ── Persist parsed config ────────────────────────────────────────────────

  /**
   * Save a ParsedConfig to the database.
   * Returns the list of saved device IDs.
   */
  async saveConfig(config: ParsedConfig): Promise<string[]> {
    const deviceIds: string[] = [];

    // Save VLANs
    for (const pv of config.vlans) {
      await this._upsertVlan(pv);
    }

    // Save devices + interfaces
    for (const pd of config.devices) {
      const device = await this._upsertDevice(pd);
      deviceIds.push(device.id);
    }

    // Save explicit connections (from Excel)
    for (const pc of config.connections) {
      await this._saveExplicitConnection(pc);
    }

    // Infer connections from shared subnets
    await this._inferConnections();

    return deviceIds;
  }

  private async _upsertVlan(pv: ParsedVlan): Promise<void> {
    const existing = await this.vlanRepo.findOne({ where: { id: pv.id } });
    if (existing) {
      if (pv.name) existing.name = pv.name;
      if (pv.subnet) existing.subnet = pv.subnet;
      await this.vlanRepo.save(existing);
    } else {
      await this.vlanRepo.save(
        this.vlanRepo.create({ id: pv.id, name: pv.name, subnet: pv.subnet }),
      );
    }
  }

  private async _upsertDevice(pd: ParsedDevice): Promise<DeviceEntity> {
    let device = await this.deviceRepo.findOne({
      where: { hostname: pd.hostname },
      relations: ['interfaces'],
    });

    if (!device) {
      device = this.deviceRepo.create({
        hostname: pd.hostname,
        vendor: pd.vendor,
        model: pd.model,
        properties: pd.properties || {},
      });
      device = await this.deviceRepo.save(device);
    } else {
      device.vendor = pd.vendor || device.vendor;
      device.model = pd.model || device.model;
      device.properties = { ...device.properties, ...(pd.properties || {}) };
      device = await this.deviceRepo.save(device);
    }

    // Upsert interfaces
    for (const pi of pd.interfaces) {
      const existing = await this.ifaceRepo.findOne({
        where: { deviceId: device.id, name: pi.name },
      });

      if (existing) {
        existing.ips = pi.ips?.length ? pi.ips : existing.ips;
        existing.speed = pi.speed || existing.speed;
        existing.vlan = pi.vlan ?? existing.vlan;
        existing.zone = pi.zone || existing.zone;
        existing.description = pi.description || existing.description;
        existing.properties = { ...existing.properties, ...(pi.properties || {}) };
        await this.ifaceRepo.save(existing);
      } else {
        const iface = this.ifaceRepo.create({
          deviceId: device.id,
          name: pi.name,
          ips: pi.ips || [],
          speed: pi.speed,
          vlan: pi.vlan,
          zone: pi.zone,
          description: pi.description,
          properties: pi.properties || {},
        });
        await this.ifaceRepo.save(iface);
      }
    }

    return device;
  }

  private async _saveExplicitConnection(pc: ParsedConnection): Promise<void> {
    const srcDevice = await this.deviceRepo.findOne({
      where: { hostname: pc.sourceHostname },
    });
    const tgtDevice = await this.deviceRepo.findOne({
      where: { hostname: pc.targetHostname },
    });

    if (!srcDevice || !tgtDevice) {
      this.logger.warn(
        `Cannot create connection: device not found (${pc.sourceHostname} → ${pc.targetHostname})`,
      );
      return;
    }

    const srcIface = pc.sourceInterface
      ? await this.ifaceRepo.findOne({
          where: { deviceId: srcDevice.id, name: pc.sourceInterface },
        })
      : null;

    const tgtIface = pc.targetInterface
      ? await this.ifaceRepo.findOne({
          where: { deviceId: tgtDevice.id, name: pc.targetInterface },
        })
      : null;

    // Avoid duplicate connections
    const existing = await this.connRepo.findOne({
      where: {
        sourceDeviceId: srcDevice.id,
        targetDeviceId: tgtDevice.id,
      },
    });

    if (!existing) {
      await this.connRepo.save(
        this.connRepo.create({
          sourceDeviceId: srcDevice.id,
          sourceInterfaceId: srcIface?.id,
          targetDeviceId: tgtDevice.id,
          targetInterfaceId: tgtIface?.id,
          vlan: pc.vlan,
          speed: pc.speed,
          connectionType: 'excel',
        }),
      );
    }
  }

  /**
   * Infer connections between devices that share an IP subnet on their interfaces.
   * Two interfaces are "connected" if they are in the same /30 or /31 subnet, or
   * more broadly if their network addresses overlap at prefix ≤ 30.
   */
  private async _inferConnections(): Promise<void> {
    const interfaces = await this.ifaceRepo.find();

    // Build a map: networkAddress → list of interfaces
    const netMap = new Map<string, InterfaceEntity[]>();

    for (const iface of interfaces) {
      if (!iface.ips) continue;
      for (const cidr of iface.ips) {
        const net = this._networkAddress(cidr);
        if (!net) continue;
        const key = net;
        if (!netMap.has(key)) netMap.set(key, []);
        netMap.get(key)!.push(iface);
      }
    }

    for (const [, ifaceList] of netMap) {
      if (ifaceList.length < 2) continue;

      // For each pair of interfaces in the same subnet
      for (let i = 0; i < ifaceList.length; i++) {
        for (let j = i + 1; j < ifaceList.length; j++) {
          const a = ifaceList[i];
          const b = ifaceList[j];

          if (a.deviceId === b.deviceId) continue; // same device

          const existing = await this.connRepo.findOne({
            where: [
              { sourceDeviceId: a.deviceId, targetDeviceId: b.deviceId },
              { sourceDeviceId: b.deviceId, targetDeviceId: a.deviceId },
            ],
          });

          if (!existing) {
            await this.connRepo.save(
              this.connRepo.create({
                sourceDeviceId: a.deviceId,
                sourceInterfaceId: a.id,
                targetDeviceId: b.deviceId,
                targetInterfaceId: b.id,
                connectionType: 'ip-inferred',
              }),
            );
          }
        }
      }
    }
  }

  // ── Query graph ─────────────────────────────────────────────────────────

  /** Return the full graph (all devices + connections) */
  async getFullGraph(): Promise<GraphData> {
    const devices = await this.deviceRepo.find({ relations: ['interfaces'] });
    const connections = await this.connRepo.find();

    return {
      nodes: devices.map((d) => this._toNode(d)),
      edges: connections.map((c) => this._toEdge(c)),
    };
  }

  /**
   * Return a filtered subgraph.
   *
   * Strategy:
   * 1. Filter FlowRecords by the given criteria.
   * 2. Collect the set of device IDs involved in matching flows.
   * 3. Return nodes for those devices and edges that connect them
   *    (optionally only edges that carried matching flows).
   */
  async getFilteredGraph(criteria: FilterCriteria): Promise<GraphData> {
    // Build flow query
    let qb = this.flowRepo.createQueryBuilder('flow');

    if (criteria.ip) {
      qb = qb.andWhere(
        '(flow.sourceIP = :ip OR flow.destIP = :ip)',
        { ip: criteria.ip },
      );
    }

    if (criteria.protocol) {
      qb = qb.andWhere('UPPER(flow.protocol) = :protocol', {
        protocol: criteria.protocol.toUpperCase(),
      });
    }

    if (criteria.port != null) {
      qb = qb.andWhere(
        '(flow.sourcePort = :port OR flow.destPort = :port)',
        { port: criteria.port },
      );
    }

    if (criteria.minOccurrences != null) {
      qb = qb.andWhere('flow.occurrenceCount >= :min', {
        min: criteria.minOccurrences,
      });
    }

    // Only include correlated flows
    qb = qb.andWhere('flow.sourceDeviceId IS NOT NULL');
    qb = qb.andWhere('flow.destDeviceId IS NOT NULL');

    const matchingFlows = await qb.getMany();

    if (matchingFlows.length === 0) {
      return { nodes: [], edges: [] };
    }

    // Collect device IDs
    const deviceIdSet = new Set<string>();
    for (const flow of matchingFlows) {
      if (flow.sourceDeviceId) deviceIdSet.add(flow.sourceDeviceId);
      if (flow.destDeviceId) deviceIdSet.add(flow.destDeviceId);
    }

    // Load devices
    const deviceIds = Array.from(deviceIdSet);
    let devices = await this.deviceRepo.find({
      where: { id: In(deviceIds) },
      relations: ['interfaces'],
    });

    // Apply interface/zone filters at device level
    if (criteria.interface || criteria.zone) {
      devices = devices.filter((d) => {
        return d.interfaces?.some((iface) => {
          const matchInterface =
            !criteria.interface ||
            iface.name.toLowerCase().includes(criteria.interface.toLowerCase());
          const matchZone =
            !criteria.zone ||
            (iface.zone &&
              iface.zone.toLowerCase() === criteria.zone.toLowerCase());
          return matchInterface && matchZone;
        });
      });

      // Re-filter flows to only those between remaining devices
      const filteredIds = new Set(devices.map((d) => d.id));
      matchingFlows.filter(
        (f) =>
          filteredIds.has(f.sourceDeviceId) &&
          filteredIds.has(f.destDeviceId),
      );
    }

    // Build edge flow aggregation map: "srcId→dstId" → aggregated data
    const edgeFlowMap = new Map<
      string,
      { totalOccurrences: number; protocols: Set<string>; ports: Set<number>; flowCount: number }
    >();

    for (const flow of matchingFlows) {
      const key = `${flow.sourceDeviceId}→${flow.destDeviceId}`;
      const reverseKey = `${flow.destDeviceId}→${flow.sourceDeviceId}`;
      const mapKey = edgeFlowMap.has(key) ? key : edgeFlowMap.has(reverseKey) ? reverseKey : key;

      if (!edgeFlowMap.has(mapKey)) {
        edgeFlowMap.set(mapKey, {
          totalOccurrences: 0,
          protocols: new Set(),
          ports: new Set(),
          flowCount: 0,
        });
      }

      const agg = edgeFlowMap.get(mapKey)!;
      agg.totalOccurrences += flow.occurrenceCount;
      agg.flowCount++;
      if (flow.protocol) agg.protocols.add(flow.protocol.toUpperCase());
      if (flow.destPort) agg.ports.add(flow.destPort);
    }

    // Load connections between the matched devices
    const filteredIds = new Set(devices.map((d) => d.id));
    const allConns = await this.connRepo.find();
    const relevantConns = allConns.filter(
      (c) =>
        filteredIds.has(c.sourceDeviceId) && filteredIds.has(c.targetDeviceId),
    );

    // Build edges with flow aggregation data
    const edges: GraphEdge[] = relevantConns.map((conn) => {
      const key1 = `${conn.sourceDeviceId}→${conn.targetDeviceId}`;
      const key2 = `${conn.targetDeviceId}→${conn.sourceDeviceId}`;
      const agg = edgeFlowMap.get(key1) || edgeFlowMap.get(key2);

      const edge = this._toEdge(conn);

      if (agg) {
        edge.totalOccurrences = agg.totalOccurrences;
        edge.protocols = Array.from(agg.protocols);
        edge.ports = Array.from(agg.ports);
        edge.flowCount = agg.flowCount;
        edge.label = this._buildEdgeLabel(agg.totalOccurrences, Array.from(agg.protocols), Array.from(agg.ports));
      }

      return edge;
    });

    // If showAllEdges is false (default), only show edges that carried matching flows
    const finalEdges = criteria.showAllEdges
      ? edges
      : edges.filter((e) => e.totalOccurrences != null && e.totalOccurrences > 0);

    return {
      nodes: devices.map((d) => this._toNode(d)),
      edges: finalEdges,
    };
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private _toNode(device: DeviceEntity): GraphNode {
    return {
      id: device.id,
      hostname: device.hostname,
      vendor: device.vendor,
      model: device.model,
      interfaces: (device.interfaces || []).map((i) => ({
        id: i.id,
        name: i.name,
        ips: i.ips || [],
        speed: i.speed,
        vlan: i.vlan,
        zone: i.zone,
        description: i.description,
      })),
      properties: device.properties || {},
    };
  }

  private _toEdge(conn: ConnectionEntity): GraphEdge {
    return {
      id: conn.id,
      sourceDeviceId: conn.sourceDeviceId,
      targetDeviceId: conn.targetDeviceId,
      sourceInterfaceId: conn.sourceInterfaceId,
      targetInterfaceId: conn.targetInterfaceId,
      connectionType: conn.connectionType,
      vlan: conn.vlan,
      speed: conn.speed,
    };
  }

  private _buildEdgeLabel(
    totalOccurrences: number,
    protocols: string[],
    ports: number[],
  ): string {
    const count =
      totalOccurrences >= 1000
        ? `${(totalOccurrences / 1000).toFixed(1)}k`
        : String(totalOccurrences);

    const protoPort = protocols
      .slice(0, 3)
      .map((proto) => {
        const proto_ports = ports.slice(0, 2).join('/');
        return proto_ports ? `${proto}/${proto_ports}` : proto;
      })
      .join(', ');

    return protoPort ? `${count} flows (${protoPort})` : `${count} flows`;
  }

  private _networkAddress(cidr: string): string | null {
    const parts = cidr.split('/');
    if (parts.length !== 2) return null;
    const ipParts = parts[0].split('.').map(Number);
    const prefix = parseInt(parts[1], 10);
    if (ipParts.length !== 4 || isNaN(prefix)) return null;

    const ipInt =
      ((ipParts[0] << 24) |
        (ipParts[1] << 16) |
        (ipParts[2] << 8) |
        ipParts[3]) >>>
      0;
    const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
    const netInt = (ipInt & mask) >>> 0;

    const a = (netInt >>> 24) & 0xff;
    const b = (netInt >>> 16) & 0xff;
    const c = (netInt >>> 8) & 0xff;
    const d = netInt & 0xff;

    return `${a}.${b}.${c}.${d}/${prefix}`;
  }
}
