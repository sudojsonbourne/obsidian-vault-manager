import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UploadModule } from './upload/upload.module';
import { GraphModule } from './graph/graph.module';
import { FlowsModule } from './flows/flows.module';
import { JobsModule } from './jobs/jobs.module';
import { DeviceEntity } from './entities/device.entity';
import { InterfaceEntity } from './entities/interface.entity';
import { ConnectionEntity } from './entities/connection.entity';
import { FlowRecordEntity } from './entities/flow-record.entity';
import { VlanEntity } from './entities/vlan.entity';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432', 10),
      username: process.env.DB_USERNAME || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
      database: process.env.DB_DATABASE || 'netdiagram',
      entities: [
        DeviceEntity,
        InterfaceEntity,
        ConnectionEntity,
        FlowRecordEntity,
        VlanEntity,
      ],
      // synchronize: true for development — set false for production and use migrations
      synchronize: true,
      logging: process.env.NODE_ENV === 'development',
    }),
    UploadModule,
    GraphModule,
    FlowsModule,
    JobsModule,
  ],
})
export class AppModule {}
