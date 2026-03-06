import { Module } from '@nestjs/common';
import { UploadController } from './upload.controller';
import { UploadService } from './upload.service';
import { GraphModule } from '../graph/graph.module';
import { FlowsModule } from '../flows/flows.module';
import { JobsModule } from '../jobs/jobs.module';
import { CiscoParser } from '../parsers/cisco.parser';
import { JuniperParser } from '../parsers/juniper.parser';
import { PaloAltoParser } from '../parsers/paloalto.parser';
import { ExcelParser } from '../parsers/excel.parser';
import { ParserFactory } from '../parsers/parser.factory';

@Module({
  imports: [GraphModule, FlowsModule, JobsModule],
  controllers: [UploadController],
  providers: [
    UploadService,
    CiscoParser,
    JuniperParser,
    PaloAltoParser,
    ExcelParser,
    ParserFactory,
  ],
})
export class UploadModule {}
