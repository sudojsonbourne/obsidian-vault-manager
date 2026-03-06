import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GraphService } from './graph.service';
import { GraphController } from './graph.controller';
import { DeviceEntity } from '../entities/device.entity';
import { InterfaceEntity } from '../entities/interface.entity';
import { ConnectionEntity } from '../entities/connection.entity';
import { FlowRecordEntity } from '../entities/flow-record.entity';
import { VlanEntity } from '../entities/vlan.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      DeviceEntity,
      InterfaceEntity,
      ConnectionEntity,
      FlowRecordEntity,
      VlanEntity,
    ]),
  ],
  providers: [GraphService],
  controllers: [GraphController],
  exports: [GraphService],
})
export class GraphModule {}
