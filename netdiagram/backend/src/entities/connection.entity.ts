import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

/**
 * Represents a link between two device interfaces.
 * Populated by IP-based inference, routing protocol neighbor discovery,
 * or explicit Excel connections.
 */
@Entity('connections')
export class ConnectionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  sourceDeviceId: string;

  @Column({ nullable: true })
  sourceInterfaceId: string;

  @Column()
  targetDeviceId: string;

  @Column({ nullable: true })
  targetInterfaceId: string;

  @Column({ nullable: true })
  vlan: number;

  @Column({ nullable: true })
  speed: string;

  /** How the connection was detected: 'ip-inferred', 'routing', 'excel' */
  @Column({ default: 'ip-inferred' })
  connectionType: string;

  @Column({ type: 'jsonb', default: '{}' })
  properties: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;
}
