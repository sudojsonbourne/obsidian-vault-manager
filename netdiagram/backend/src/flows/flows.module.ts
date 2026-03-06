import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FlowsService } from './flows.service';
import { FlowRecordEntity } from '../entities/flow-record.entity';
import { InterfaceEntity } from '../entities/interface.entity';

@Module({
  imports: [TypeOrmModule.forFeature([FlowRecordEntity, InterfaceEntity])],
  providers: [FlowsService],
  exports: [FlowsService],
})
export class FlowsModule {}
