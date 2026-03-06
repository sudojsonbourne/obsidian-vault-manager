import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { GraphService } from '../graph/graph.service';
import { FlowsService, ColumnMapping } from '../flows/flows.service';
import { JobsService } from '../jobs/jobs.service';
import { ParserFactory } from '../parsers/parser.factory';

/** Allowed config file extensions */
const CONFIG_EXTENSIONS = new Set([
  '.txt', '.cfg', '.conf', '.ios', '.junos', '.juniper', '.jnpr',
  '.xml', '.json', '.xlsx', '.xls',
]);

/** Allowed traffic log extensions */
const LOG_EXTENSIONS = new Set(['.csv', '.tsv', '.xlsx', '.xls', '.txt']);

/**
 * UploadService orchestrates the full upload pipeline:
 *   1. Detect file type (config vs. traffic log)
 *   2. Parse config files → save to graph
 *   3. Ingest traffic logs → aggregate flows
 *   4. Correlate flows to devices
 */
@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);

  constructor(
    private readonly parserFactory: ParserFactory,
    private readonly graphService: GraphService,
    private readonly flowsService: FlowsService,
    private readonly jobsService: JobsService,
  ) {}

  /**
   * Process uploaded files asynchronously.
   * @param files          Array of Multer files
   * @param columnMapping  Optional column mapping for traffic logs
   * @param fileTypes      Optional map of filename → 'config' | 'log' (user override)
   * @returns jobId
   */
  async processFiles(
    files: Express.Multer.File[],
    columnMapping?: ColumnMapping,
    fileTypes?: Record<string, 'config' | 'log'>,
  ): Promise<string> {
    const job = this.jobsService.create('Upload received; processing...');

    // Run processing in the background (non-blocking)
    this._runPipeline(job.id, files, columnMapping, fileTypes).catch((err) => {
      this.logger.error(`Job ${job.id} failed: ${err.message}`, err.stack);
      this.jobsService.fail(job.id, err.message);
    });

    return job.id;
  }

  private async _runPipeline(
    jobId: string,
    files: Express.Multer.File[],
    columnMapping?: ColumnMapping,
    fileTypes?: Record<string, 'config' | 'log'>,
  ): Promise<void> {
    this.jobsService.update(jobId, {
      status: 'processing',
      progress: 5,
      message: 'Classifying files...',
    });

    // Classify each file
    const configFiles: Express.Multer.File[] = [];
    const logFiles: Express.Multer.File[] = [];

    for (const file of files) {
      const userType = fileTypes?.[file.originalname];
      if (userType === 'config') {
        configFiles.push(file);
      } else if (userType === 'log') {
        logFiles.push(file);
      } else {
        // Auto-detect: if parser can handle it as a device config, treat as config
        if (this._isConfigFile(file)) {
          configFiles.push(file);
        } else {
          logFiles.push(file);
        }
      }
    }

    this.logger.log(
      `Job ${jobId}: ${configFiles.length} config file(s), ${logFiles.length} traffic log(s)`,
    );

    // ── Phase 1: Parse config files ────────────────────────────────────────
    if (configFiles.length > 0) {
      this.jobsService.update(jobId, {
        progress: 20,
        message: `Parsing ${configFiles.length} config file(s)...`,
      });

      let configsDone = 0;
      for (const file of configFiles) {
        try {
          this.logger.log(`Parsing config: ${file.originalname}`);
          const parsed = await this.parserFactory.parse(
            file.originalname,
            file.buffer,
          );
          await this.graphService.saveConfig(parsed);
          configsDone++;

          this.jobsService.update(jobId, {
            progress: 20 + Math.floor((configsDone / configFiles.length) * 30),
            message: `Parsed ${configsDone}/${configFiles.length} config files...`,
          });
        } catch (err) {
          this.logger.error(
            `Failed to parse ${file.originalname}: ${err.message}`,
          );
          // Continue with other files; non-fatal
        }
      }
    }

    // ── Phase 2: Ingest traffic logs ──────────────────────────────────────
    if (logFiles.length > 0) {
      if (!columnMapping) {
        throw new BadRequestException(
          'columnMapping is required when uploading traffic log files.',
        );
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
          const result = await this.flowsService.ingestFile(
            file.buffer,
            file.originalname,
            columnMapping,
          );
          totalInserted += result.inserted;
          totalUpdated += result.updated;
          logsDone++;

          this.jobsService.update(jobId, {
            progress: 55 + Math.floor((logsDone / logFiles.length) * 20),
            message: `Ingested ${logsDone}/${logFiles.length} log files (${totalInserted} new flows, ${totalUpdated} updated)...`,
          });
        } catch (err) {
          this.logger.error(
            `Failed to ingest ${file.originalname}: ${err.message}`,
          );
        }
      }
    }

    // ── Phase 3: Correlate flows to devices ───────────────────────────────
    this.jobsService.update(jobId, {
      progress: 80,
      message: 'Correlating traffic flows to devices...',
    });

    await this.flowsService.correlateFlows();

    // ── Done ──────────────────────────────────────────────────────────────
    this.jobsService.complete(jobId, {
      configFiles: configFiles.length,
      logFiles: logFiles.length,
    });

    this.logger.log(`Job ${jobId} completed successfully.`);
  }

  /** Heuristic: is this file a device config (vs. a traffic log)? */
  private _isConfigFile(file: Express.Multer.File): boolean {
    const lower = file.originalname.toLowerCase();
    const ext = '.' + lower.split('.').pop();

    // CSV/TSV are always logs
    if (ext === '.csv' || ext === '.tsv') return false;

    // XML/JSON could be PaloAlto config
    if (ext === '.xml' || ext === '.json') return true;

    // Excel: if it has a Devices sheet → config, otherwise → log
    // We can't easily peek without parsing, so default to config for .xlsx
    if (ext === '.xlsx' || ext === '.xls') return true;

    // .txt, .cfg, .conf, .ios → config
    if (['.txt', '.cfg', '.conf', '.ios', '.junos', '.juniper', '.jnpr'].includes(ext)) return true;

    return false;
  }
}
