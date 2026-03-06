import { DeviceEntity } from './device.entity';
export declare class InterfaceEntity {
    id: string;
    deviceId: string;
    device: DeviceEntity;
    name: string;
    ips: string[];
    speed: string;
    vlan: number;
    zone: string;
    description: string;
    properties: Record<string, any>;
}
