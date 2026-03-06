import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { DeviceEntity } from './device.entity';

@Entity('interfaces')
export class InterfaceEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  deviceId: string;

  @ManyToOne(() => DeviceEntity, (device) => device.interfaces, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'deviceId' })
  device: DeviceEntity;

  @Column()
  name: string; // e.g. GigabitEthernet0/0, ethernet1/1

  /** Array of CIDR strings, e.g. ["192.168.1.1/24", "10.0.0.1/30"] */
  @Column({ type: 'simple-array', nullable: true })
  ips: string[];

  @Column({ nullable: true })
  speed: string; // e.g. '1000', '10000', 'auto'

  @Column({ nullable: true })
  vlan: number;

  @Column({ nullable: true })
  zone: string; // firewall zone name (PaloAlto)

  @Column({ nullable: true })
  description: string;

  /** Extra fields */
  @Column({ type: 'jsonb', default: '{}' })
  properties: Record<string, any>;
}
