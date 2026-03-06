"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var UploadService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.UploadService = void 0;
const common_1 = require("@nestjs/common");
const graph_service_1 = require("../graph/graph.service");
const flows_service_1 = require("../flows/flows.service");
const jobs_service_1 = require("../jobs/jobs.service");
const parser_factory_1 = require("../parsers/parser.factory");
const CONFIG_EXTENSIONS = new Set([
    '.txt', '.cfg', '.conf', '.ios', '.junos', '.juniper', '.jnpr',
    '.xml', '.json', '.xlsx', '.xls',
]);
const LOG_EXTENSIONS = new Set(['.csv', '.tsv', '.xlsx', '.xls', '.txt']);
let UploadService = UploadService_1 = class UploadService {
    constructor(parserFactory, graphService, flowsService, jobsService) {
        this.parserFactory = parserFactory;
        this.graphService = graphService;
        this.flowsService = flowsService;
        this.jobsService = jobsService;
        this.logger = new common_1.Logger(UploadService_1.name);
    }
    async processFiles(files, columnMapping, fileTypes) {
        const job = this.jobsService.create('Upload received; processing...');
        this._runPipeline(job.id, files, columnMapping, fileTypes).catch((err) => {
            this.logger.error(`Job ${job.id} failed: ${err.message}`, err.stack);
            this.jobsService.fail(job.id, err.message);
        });
        return job.id;
    }
    async _runPipeline(jobId, files, columnMapping, fileTypes) {
        this.jobsService.update(jobId, {
            status: 'processing',
            progress: 5,
            message: 'Classifying files...',
        });
        const configFiles = [];
        const logFiles = [];
        for (const file of files) {
            const userType = fileTypes?.[file.originalname];
            if (userType === 'config') {
                configFiles.push(file);
            }
            else if (userType === 'log') {
                logFiles.push(file);
            }
            else {
                if (this._isConfigFile(file)) {
                    configFiles.push(file);
                }
                else {
                    logFiles.push(file);
                }
            }
        }
        this.logger.log(`Job ${jobId}: ${configFiles.length} config file(s), ${logFiles.length} traffic log(s)`);
        if (configFiles.length > 0) {
            this.jobsService.update(jobId, {
                progress: 20,
                message: `Parsing ${configFiles.length} config file(s)...`,
            });
            let configsDone = 0;
            for (const file of configFiles) {
                try {
                    this.logger.log(`Parsing config: ${file.originalname}`);
                    const parsed = await this.parserFactory.parse(file.originalname, file.buffer);
                    await this.graphService.saveConfig(parsed);
                    configsDone++;
                    this.jobsService.update(jobId, {
                        progress: 20 + Math.floor((configsDone / configFiles.length) * 30),
                        message: `Parsed ${configsDone}/${configFiles.length} config files...`,
                    });
                }
                catch (err) {
                    this.logger.error(`Failed to parse ${file.originalname}: ${err.message}`);
                }
            }
        }
        if (logFiles.length > 0) {
            if (!columnMapping) {
                throw new common_1.BadRequestException('columnMapping is required when uploading traffic log files.');
            }
            this.jobsService.update(jobId, {
                progress: 55,
                message: `Ingesting ${logFiles.length} traffic log(s)...`,
            });
            let logsDone = 0;
            let totalInserted = 0;
            let totalUpdated = 0;
            for (const file of logFiles) {
                try {
                    this.logger.log(`Ingesting traffic log: ${file.originalname}`);
                    const result = await this.flowsService.ingestFile(file.buffer, file.originalname, columnMapping);
                    totalInserted += result.inserted;
                    totalUpdated += result.updated;
                    logsDone++;
                    this.jobsService.update(jobId, {
                        progress: 55 + Math.floor((logsDone / logFiles.length) * 20),
                        message: `Ingested ${logsDone}/${logFiles.length} log files (${totalInserted} new flows, ${totalUpdated} updated)...`,
                    });
                }
                catch (err) {
                    this.logger.error(`Failed to ingest ${file.originalname}: ${err.message}`);
                }
            }
        }
        this.jobsService.update(jobId, {
            progress: 80,
            message: 'Correlating traffic flows to devices...',
        });
        await this.flowsService.correlateFlows();
        this.jobsService.complete(jobId, {
            configFiles: configFiles.length,
            logFiles: logFiles.length,
        });
        this.logger.log(`Job ${jobId} completed successfully.`);
    }
    _isConfigFile(file) {
        const lower = file.originalname.toLowerCase();
        const ext = '.' + lower.split('.').pop();
        if (ext === '.csv' || ext === '.tsv')
            return false;
        if (ext === '.xml' || ext === '.json')
            return true;
        if (ext === '.xlsx' || ext === '.xls')
            return true;
        if (['.txt', '.cfg', '.conf', '.ios', '.junos', '.juniper', '.jnpr'].includes(ext))
            return true;
        return false;
    }
};
exports.UploadService = UploadService;
exports.UploadService = UploadService = UploadService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [parser_factory_1.ParserFactory,
        graph_service_1.GraphService,
        flows_service_1.FlowsService,
        jobs_service_1.JobsService])
], UploadService);
//# sourceMappingURL=upload.service.js.map