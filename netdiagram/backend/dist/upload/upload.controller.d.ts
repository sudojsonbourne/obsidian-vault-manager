import { UploadService } from './upload.service';
import { JobsService } from '../jobs/jobs.service';
export declare class UploadController {
    private readonly uploadService;
    private readonly jobsService;
    constructor(uploadService: UploadService, jobsService: JobsService);
    uploadFiles(files: Express.Multer.File[], columnMappingStr?: string, fileTypesStr?: string): Promise<{
        jobId: string;
    }>;
    getStatus(jobId: string): {
        id: string;
        status: import("../jobs/jobs.service").JobStatus;
        progress: number;
        message: string;
        result: any;
        error: string;
    };
}
