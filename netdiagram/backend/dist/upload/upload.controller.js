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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UploadController = void 0;
const common_1 = require("@nestjs/common");
const platform_express_1 = require("@nestjs/platform-express");
const upload_service_1 = require("./upload.service");
const jobs_service_1 = require("../jobs/jobs.service");
const multer = require("multer");
const MAX_FILE_SIZE = 100 * 1024 * 1024;
const ALLOWED_MIMETYPES = new Set([
    'text/plain',
    'text/csv',
    'application/xml',
    'text/xml',
    'application/json',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'application/octet-stream',
]);
let UploadController = class UploadController {
    constructor(uploadService, jobsService) {
        this.uploadService = uploadService;
        this.jobsService = jobsService;
    }
    async uploadFiles(files, columnMappingStr, fileTypesStr) {
        if (!files || files.length === 0) {
            throw new common_1.BadRequestException('No files uploaded.');
        }
        let columnMapping;
        if (columnMappingStr) {
            try {
                columnMapping = JSON.parse(columnMappingStr);
            }
            catch {
                throw new common_1.BadRequestException('Invalid columnMapping JSON.');
            }
        }
        let fileTypes;
        if (fileTypesStr) {
            try {
                fileTypes = JSON.parse(fileTypesStr);
            }
            catch {
                throw new common_1.BadRequestException('Invalid fileTypes JSON.');
            }
        }
        const jobId = await this.uploadService.processFiles(files, columnMapping, fileTypes);
        return { jobId };
    }
    getStatus(jobId) {
        const job = this.jobsService.get(jobId);
        if (!job) {
            throw new common_1.NotFoundException(`Job ${jobId} not found.`);
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
};
exports.UploadController = UploadController;
__decorate([
    (0, common_1.Post)('upload'),
    (0, common_1.UseInterceptors)((0, platform_express_1.FilesInterceptor)('files', 20, {
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
            }
            else {
                cb(new common_1.BadRequestException(`File type .${ext} is not supported. Allowed: ${allowed.join(', ')}`), false);
            }
        },
    })),
    __param(0, (0, common_1.UploadedFiles)()),
    __param(1, (0, common_1.Body)('columnMapping')),
    __param(2, (0, common_1.Body)('fileTypes')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Array, String, String]),
    __metadata("design:returntype", Promise)
], UploadController.prototype, "uploadFiles", null);
__decorate([
    (0, common_1.Get)('status/:jobId'),
    __param(0, (0, common_1.Param)('jobId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], UploadController.prototype, "getStatus", null);
exports.UploadController = UploadController = __decorate([
    (0, common_1.Controller)(),
    __metadata("design:paramtypes", [upload_service_1.UploadService,
        jobs_service_1.JobsService])
], UploadController);
//# sourceMappingURL=upload.controller.js.map