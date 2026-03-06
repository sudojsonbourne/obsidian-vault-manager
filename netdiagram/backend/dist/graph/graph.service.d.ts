import { Repository } from 'typeorm';
import { DeviceEntity } from '../entities/device.entity';
import { InterfaceEntity } from '../entities/interface.entity';
import { ConnectionEntity } from '../entities/connection.entity';
import { FlowRecordEntity } from '../entities/flow-record.entity';
import { VlanEntity } from '../entities/vlan.entity';
import { ParsedConfig } from '../parsers/parser.interface';
export interface FilterCriteria {
    interface?: string;
    zone?: string;
    ip?: string;
    protocol?: string;
    port?: number;
    minOccurrences?: number;
    showAllEdges?: boolean;
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
export declare class GraphService {
    private readonly deviceRepo;
    private readonly ifaceRepo;
    private readonly connRepo;
    private readonly flowRepo;
    private readonly vlanRepo;
    private readonly logger;
    constructor(deviceRepo: Repository<DeviceEntity>, ifaceRepo: Repository<InterfaceEntity>, connRepo: Repository<ConnectionEntity>, flowRepo: Repository<FlowRecordEntity>, vlanRepo: Repository<VlanEntity>);
    saveConfig(config: ParsedConfig): Promise<string[]>;
    private _upsertVlan;
    private _upsertDevice;
    private _saveExplicitConnection;
    private _inferConnections;
    getFullGraph(): Promise<GraphData>;
    getFilteredGraph(criteria: FilterCriteria): Promise<GraphData>;
    private _toNode;
    private _toEdge;
    private _buildEdgeLabel;
    private _networkAddress;
}
