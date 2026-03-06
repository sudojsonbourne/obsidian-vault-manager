import { Repository, DataSource } from 'typeorm';
import { FlowRecordEntity } from '../entities/flow-record.entity';
import { InterfaceEntity } from '../entities/interface.entity';
export interface ColumnMapping {
    sourceIP: string;
    destIP: string;
    sourcePort?: string;
    destPort?: string;
    protocol?: string;
    timestamp?: string;
}
export interface LogRow {
    sourceIP: string;
    destIP: string;
    sourcePort?: number;
    destPort?: number;
    protocol?: string;
    timestamp?: string;
}
export declare class FlowsService {
    private readonly flowRepo;
    private readonly ifaceRepo;
    private readonly dataSource;
    private readonly logger;
    constructor(flowRepo: Repository<FlowRecordEntity>, ifaceRepo: Repository<InterfaceEntity>, dataSource: DataSource);
    ingestFile(content: Buffer, filename: string, mapping: ColumnMapping): Promise<{
        inserted: number;
        updated: number;
    }>;
    private _parseLogFile;
    private _parseCsv;
    private _parseExcel;
    private _mapRecord;
    private _upsertFlows;
    private _upsertChunk;
    private _makeFlowKey;
    correlateFlows(): Promise<void>;
    private _buildIpTable;
    private _longestPrefixMatch;
    private _parseCidr;
    private _ipToInt;
}
