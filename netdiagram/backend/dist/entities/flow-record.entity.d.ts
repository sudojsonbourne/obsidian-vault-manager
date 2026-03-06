export declare class FlowRecordEntity {
    id: string;
    flowKey: string;
    sourceIP: string;
    destIP: string;
    sourcePort: number;
    destPort: number;
    protocol: string;
    occurrenceCount: number;
    firstSeen: Date;
    lastSeen: Date;
    sourceDeviceId: string;
    destDeviceId: string;
    sourceInterfaceId: string;
    destInterfaceId: string;
    createdAt: Date;
    updatedAt: Date;
}
