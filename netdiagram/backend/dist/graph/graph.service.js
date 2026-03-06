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
var GraphService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.GraphService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const device_entity_1 = require("../entities/device.entity");
const interface_entity_1 = require("../entities/interface.entity");
const connection_entity_1 = require("../entities/connection.entity");
const flow_record_entity_1 = require("../entities/flow-record.entity");
const vlan_entity_1 = require("../entities/vlan.entity");
let GraphService = GraphService_1 = class GraphService {
    constructor(deviceRepo, ifaceRepo, connRepo, flowRepo, vlanRepo) {
        this.deviceRepo = deviceRepo;
        this.ifaceRepo = ifaceRepo;
        this.connRepo = connRepo;
        this.flowRepo = flowRepo;
        this.vlanRepo = vlanRepo;
        this.logger = new common_1.Logger(GraphService_1.name);
    }
    async saveConfig(config) {
        const deviceIds = [];
        for (const pv of config.vlans) {
            await this._upsertVlan(pv);
        }
        for (const pd of config.devices) {
            const device = await this._upsertDevice(pd);
            deviceIds.push(device.id);
        }
        for (const pc of config.connections) {
            await this._saveExplicitConnection(pc);
        }
        await this._inferConnections();
        return deviceIds;
    }
    async _upsertVlan(pv) {
        const existing = await this.vlanRepo.findOne({ where: { id: pv.id } });
        if (existing) {
            if (pv.name)
                existing.name = pv.name;
            if (pv.subnet)
                existing.subnet = pv.subnet;
            await this.vlanRepo.save(existing);
        }
        else {
            await this.vlanRepo.save(this.vlanRepo.create({ id: pv.id, name: pv.name, subnet: pv.subnet }));
        }
    }
    async _upsertDevice(pd) {
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
        }
        else {
            device.vendor = pd.vendor || device.vendor;
            device.model = pd.model || device.model;
            device.properties = { ...device.properties, ...(pd.properties || {}) };
            device = await this.deviceRepo.save(device);
        }
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
            }
            else {
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
    async _saveExplicitConnection(pc) {
        const srcDevice = await this.deviceRepo.findOne({
            where: { hostname: pc.sourceHostname },
        });
        const tgtDevice = await this.deviceRepo.findOne({
            where: { hostname: pc.targetHostname },
        });
        if (!srcDevice || !tgtDevice) {
            this.logger.warn(`Cannot create connection: device not found (${pc.sourceHostname} → ${pc.targetHostname})`);
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
        const existing = await this.connRepo.findOne({
            where: {
                sourceDeviceId: srcDevice.id,
                targetDeviceId: tgtDevice.id,
            },
        });
        if (!existing) {
            await this.connRepo.save(this.connRepo.create({
                sourceDeviceId: srcDevice.id,
                sourceInterfaceId: srcIface?.id,
                targetDeviceId: tgtDevice.id,
                targetInterfaceId: tgtIface?.id,
                vlan: pc.vlan,
                speed: pc.speed,
                connectionType: 'excel',
            }));
        }
    }
    async _inferConnections() {
        const interfaces = await this.ifaceRepo.find();
        const netMap = new Map();
        for (const iface of interfaces) {
            if (!iface.ips)
                continue;
            for (const cidr of iface.ips) {
                const net = this._networkAddress(cidr);
                if (!net)
                    continue;
                const key = net;
                if (!netMap.has(key))
                    netMap.set(key, []);
                netMap.get(key).push(iface);
            }
        }
        for (const [, ifaceList] of netMap) {
            if (ifaceList.length < 2)
                continue;
            for (let i = 0; i < ifaceList.length; i++) {
                for (let j = i + 1; j < ifaceList.length; j++) {
                    const a = ifaceList[i];
                    const b = ifaceList[j];
                    if (a.deviceId === b.deviceId)
                        continue;
                    const existing = await this.connRepo.findOne({
                        where: [
                            { sourceDeviceId: a.deviceId, targetDeviceId: b.deviceId },
                            { sourceDeviceId: b.deviceId, targetDeviceId: a.deviceId },
                        ],
                    });
                    if (!existing) {
                        await this.connRepo.save(this.connRepo.create({
                            sourceDeviceId: a.deviceId,
                            sourceInterfaceId: a.id,
                            targetDeviceId: b.deviceId,
                            targetInterfaceId: b.id,
                            connectionType: 'ip-inferred',
                        }));
                    }
                }
            }
        }
    }
    async getFullGraph() {
        const devices = await this.deviceRepo.find({ relations: ['interfaces'] });
        const connections = await this.connRepo.find();
        return {
            nodes: devices.map((d) => this._toNode(d)),
            edges: connections.map((c) => this._toEdge(c)),
        };
    }
    async getFilteredGraph(criteria) {
        let qb = this.flowRepo.createQueryBuilder('flow');
        if (criteria.ip) {
            qb = qb.andWhere('(flow.sourceIP = :ip OR flow.destIP = :ip)', { ip: criteria.ip });
        }
        if (criteria.protocol) {
            qb = qb.andWhere('UPPER(flow.protocol) = :protocol', {
                protocol: criteria.protocol.toUpperCase(),
            });
        }
        if (criteria.port != null) {
            qb = qb.andWhere('(flow.sourcePort = :port OR flow.destPort = :port)', { port: criteria.port });
        }
        if (criteria.minOccurrences != null) {
            qb = qb.andWhere('flow.occurrenceCount >= :min', {
                min: criteria.minOccurrences,
            });
        }
        qb = qb.andWhere('flow.sourceDeviceId IS NOT NULL');
        qb = qb.andWhere('flow.destDeviceId IS NOT NULL');
        const matchingFlows = await qb.getMany();
        if (matchingFlows.length === 0) {
            return { nodes: [], edges: [] };
        }
        const deviceIdSet = new Set();
        for (const flow of matchingFlows) {
            if (flow.sourceDeviceId)
                deviceIdSet.add(flow.sourceDeviceId);
            if (flow.destDeviceId)
                deviceIdSet.add(flow.destDeviceId);
        }
        const deviceIds = Array.from(deviceIdSet);
        let devices = await this.deviceRepo.find({
            where: { id: (0, typeorm_2.In)(deviceIds) },
            relations: ['interfaces'],
        });
        if (criteria.interface || criteria.zone) {
            devices = devices.filter((d) => {
                return d.interfaces?.some((iface) => {
                    const matchInterface = !criteria.interface ||
                        iface.name.toLowerCase().includes(criteria.interface.toLowerCase());
                    const matchZone = !criteria.zone ||
                        (iface.zone &&
                            iface.zone.toLowerCase() === criteria.zone.toLowerCase());
                    return matchInterface && matchZone;
                });
            });
            const filteredIds = new Set(devices.map((d) => d.id));
            matchingFlows.filter((f) => filteredIds.has(f.sourceDeviceId) &&
                filteredIds.has(f.destDeviceId));
        }
        const edgeFlowMap = new Map();
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
            const agg = edgeFlowMap.get(mapKey);
            agg.totalOccurrences += flow.occurrenceCount;
            agg.flowCount++;
            if (flow.protocol)
                agg.protocols.add(flow.protocol.toUpperCase());
            if (flow.destPort)
                agg.ports.add(flow.destPort);
        }
        const filteredIds = new Set(devices.map((d) => d.id));
        const allConns = await this.connRepo.find();
        const relevantConns = allConns.filter((c) => filteredIds.has(c.sourceDeviceId) && filteredIds.has(c.targetDeviceId));
        const edges = relevantConns.map((conn) => {
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
        const finalEdges = criteria.showAllEdges
            ? edges
            : edges.filter((e) => e.totalOccurrences != null && e.totalOccurrences > 0);
        return {
            nodes: devices.map((d) => this._toNode(d)),
            edges: finalEdges,
        };
    }
    _toNode(device) {
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
    _toEdge(conn) {
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
    _buildEdgeLabel(totalOccurrences, protocols, ports) {
        const count = totalOccurrences >= 1000
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
    _networkAddress(cidr) {
        const parts = cidr.split('/');
        if (parts.length !== 2)
            return null;
        const ipParts = parts[0].split('.').map(Number);
        const prefix = parseInt(parts[1], 10);
        if (ipParts.length !== 4 || isNaN(prefix))
            return null;
        const ipInt = ((ipParts[0] << 24) |
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
};
exports.GraphService = GraphService;
exports.GraphService = GraphService = GraphService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(device_entity_1.DeviceEntity)),
    __param(1, (0, typeorm_1.InjectRepository)(interface_entity_1.InterfaceEntity)),
    __param(2, (0, typeorm_1.InjectRepository)(connection_entity_1.ConnectionEntity)),
    __param(3, (0, typeorm_1.InjectRepository)(flow_record_entity_1.FlowRecordEntity)),
    __param(4, (0, typeorm_1.InjectRepository)(vlan_entity_1.VlanEntity)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository])
], GraphService);
//# sourceMappingURL=graph.service.js.map