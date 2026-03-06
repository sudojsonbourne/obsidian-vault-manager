import { Entity, PrimaryColumn, Column } from 'typeorm';

@Entity('vlans')
export class VlanEntity {
  @PrimaryColumn()
  id: number; // VLAN ID (1–4094)

  @Column({ nullable: true })
  name: string;

  @Column({ nullable: true })
  subnet: string; // CIDR of the VLAN's associated subnet
}
