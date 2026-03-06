export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed';
export interface Job {
    id: string;
    status: JobStatus;
    progress: number;
    message: string;
    result?: any;
    error?: string;
    createdAt: Date;
    updatedAt: Date;
}
export declare class JobsService {
    private readonly jobs;
    create(message?: string): Job;
    get(id: string): Job | undefined;
    update(id: string, patch: Partial<Pick<Job, 'status' | 'progress' | 'message' | 'result' | 'error'>>): Job;
    complete(id: string, result?: any): Job;
    fail(id: string, error: string): Job;
}
