export declare class ConnectionEntity {
    id: string;
    sourceDeviceId: string;
    sourceInterfaceId: string;
    targetDeviceId: string;
    targetInterfaceId: string;
    vlan: number;
    speed: string;
    connectionType: string;
    properties: Record<string, any>;
    createdAt: Date;
}
