"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.JobsService = void 0;
const common_1 = require("@nestjs/common");
const uuid_1 = require("uuid");
let JobsService = class JobsService {
    constructor() {
        this.jobs = new Map();
    }
    create(message = 'Job created') {
        const id = (0, uuid_1.v4)();
        const job = {
            id,
            status: 'pending',
            progress: 0,
            message,
            createdAt: new Date(),
            updatedAt: new Date(),
        };
        this.jobs.set(id, job);
        return job;
    }
    get(id) {
        return this.jobs.get(id);
    }
    update(id, patch) {
        const job = this.jobs.get(id);
        if (!job)
            throw new Error(`Job ${id} not found`);
        Object.assign(job, patch, { updatedAt: new Date() });
        return job;
    }
    complete(id, result) {
        return this.update(id, {
            status: 'completed',
            progress: 100,
            message: 'Completed successfully',
            result,
        });
    }
    fail(id, error) {
        return this.update(id, {
            status: 'failed',
            progress: 0,
            message: `Failed: ${error}`,
            error,
        });
    }
};
exports.JobsService = JobsService;
exports.JobsService = JobsService = __decorate([
    (0, common_1.Injectable)()
], JobsService);
//# sourceMappingURL=jobs.service.js.map