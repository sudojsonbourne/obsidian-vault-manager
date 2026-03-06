import { GraphService } from '../graph/graph.service';
import { FlowsService, ColumnMapping } from '../flows/flows.service';
import { JobsService } from '../jobs/jobs.service';
import { ParserFactory } from '../parsers/parser.factory';
export declare class UploadService {
    private readonly parserFactory;
    private readonly graphService;
    private readonly flowsService;
    private readonly jobsService;
    private readonly logger;
    constructor(parserFactory: ParserFactory, graphService: GraphService, flowsService: FlowsService, jobsService: JobsService);
    processFiles(files: Express.Multer.File[], columnMapping?: ColumnMapping, fileTypes?: Record<string, 'config' | 'log'>): Promise<string>;
    private _runPipeline;
    private _isConfigFile;
}
