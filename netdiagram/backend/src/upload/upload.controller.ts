import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  UploadedFiles,
  UseInterceptors,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { UploadService } from './upload.service';
import { JobsService } from '../jobs/jobs.service';
import { ColumnMapping } from '../flows/flows.service';
import * as multer from 'multer';

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB
const ALLOWED_MIMETYPES = new Set([
  'text/plain',
  'text/csv',
  'application/xml',
  'text/xml',
  'application/json',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/octet-stream', // fallback for cfg/ios files
]);

@Controller()
export class UploadController {
  constructor(
    private readonly uploadService: UploadService,
    private readonly jobsService: JobsService,
  ) {}

  /**
   * POST /upload
   *
   * Accepts multipart/form-data with:
   *   - files[]           : one or more config/log files
   *   - columnMapping     : JSON string with column→field mapping for traffic logs
   *   - fileTypes         : JSON string mapping filename → 'config' | 'log' (optional override)
   *
   * Returns: { jobId: string }
   */
  @Post('upload')
  @UseInterceptors(
    FilesInterceptor('files', 20, {
      storage: multer.memoryStorage(),
      limits: { fileSize: MAX_FILE_SIZE },
      fileFilter: (_req, file, cb) => {
        const ext = file.originalname.toLowerCase().split('.').pop();
        const allowed = [
          'txt', 'cfg', 'conf', 'ios',
          'junos', 'juniper', 'jnpr',
          'xml', 'json',
          'xlsx', 'xls',
          'csv', 'tsv',
        ];
        if (allowed.includes(ext)) {
          cb(null, true);
        } else {
          cb(
            new BadRequestException(
              `File type .${ext} is not supported. Allowed: ${allowed.join(', ')}`,
            ),
            false,
          );
        }
      },
    }),
  )
  async uploadFiles(
    @UploadedFiles() files: Express.Multer.File[],
    @Body('columnMapping') columnMappingStr?: string,
    @Body('fileTypes') fileTypesStr?: string,
  ) {
    if (!files || files.length === 0) {
      throw new BadRequestException('No files uploaded.');
    }

    let columnMapping: ColumnMapping | undefined;
    if (columnMappingStr) {
      try {
        columnMapping = JSON.parse(columnMappingStr);
      } catch {
        throw new BadRequestException('Invalid columnMapping JSON.');
      }
    }

    let fileTypes: Record<string, 'config' | 'log'> | undefined;
    if (fileTypesStr) {
      try {
        fileTypes = JSON.parse(fileTypesStr);
      } catch {
        throw new BadRequestException('Invalid fileTypes JSON.');
      }
    }

    const jobId = await this.uploadService.processFiles(
      files,
      columnMapping,
      fileTypes,
    );

    return { jobId };
  }

  /**
   * GET /status/:jobId
   *
   * Poll job progress.
   * Returns: { id, status, progress, message, result?, error? }
   */
  @Get('status/:jobId')
  getStatus(@Param('jobId') jobId: string) {
    const job = this.jobsService.get(jobId);
    if (!job) {
      throw new NotFoundException(`Job ${jobId} not found.`);
    }
    return {
      id: job.id,
      status: job.status,
      progress: job.progress,
      message: job.message,
      result: job.result,
      error: job.error,
    };
  }
}
