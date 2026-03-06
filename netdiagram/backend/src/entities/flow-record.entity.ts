import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * Aggregated traffic flow record.
 * The 5-tuple (srcIP, dstIP, srcPort, dstPort, protocol) is hashed into flowKey.
 * Multiple log entries with the same 5-tuple are merged (occurrenceCount incremented).
 */
@Entity('flow_records')
export class FlowRecordEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** SHA-256 hash of the 5-tuple — used for upsert deduplication */
  @Column({ unique: true })
  @Index()
  flowKey: string;

  @Column()
  sourceIP: string;

  @Column()
  destIP: string;

  @Column({ nullable: true })
  sourcePort: number;

  @Column({ nullable: true })
  destPort: number;

  @Column({ nullable: true })
  protocol: string; // e.g. 'TCP', 'UDP', 'ICMP'

  @Column({ default: 1 })
  occurrenceCount: number;

  @Column({ type: 'timestamptz', nullable: true })
  firstSeen: Date;

  @Column({ type: 'timestamptz', nullable: true })
  lastSeen: Date;

  /** Resolved during correlation phase */
  @Column({ nullable: true })
  @Index()
  sourceDeviceId: string;

  @Column({ nullable: true })
  @Index()
  destDeviceId: string;

  @Column({ nullable: true })
  sourceInterfaceId: string;

  @Column({ nullable: true })
  destInterfaceId: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
