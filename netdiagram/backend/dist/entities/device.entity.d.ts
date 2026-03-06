import { InterfaceEntity } from './interface.entity';
export declare class DeviceEntity {
    id: string;
    hostname: string;
    vendor: string;
    model: string;
    properties: Record<string, any>;
    interfaces: InterfaceEntity[];
    createdAt: Date;
    updatedAt: Date;
}
