import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { InterfaceEntity } from './interface.entity';

@Entity('devices')
export class DeviceEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  hostname: string;

  @Column({ default: 'unknown' })
  vendor: string; // 'cisco', 'paloalto', 'excel', 'unknown'

  @Column({ nullable: true })
  model: string;

  /** Arbitrary extra fields (e.g. OS version, serial, etc.) */
  @Column({ type: 'jsonb', default: '{}' })
  properties: Record<string, any>;

  @OneToMany(() => InterfaceEntity, (iface) => iface.device, {
    cascade: true,
    eager: false,
  })
  interfaces: InterfaceEntity[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
