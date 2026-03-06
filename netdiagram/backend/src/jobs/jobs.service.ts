import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';

export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface Job {
  id: string;
  status: JobStatus;
  progress: number; // 0–100
  message: string;
  result?: any;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Simple in-memory job tracker.
 * For production scale, replace with Bull + Redis.
 */
@Injectable()
export class JobsService {
  private readonly jobs = new Map<string, Job>();

  create(message = 'Job created'): Job {
    const id = uuidv4();
    const job: Job = {
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

  get(id: string): Job | undefined {
    return this.jobs.get(id);
  }

  update(
    id: string,
    patch: Partial<Pick<Job, 'status' | 'progress' | 'message' | 'result' | 'error'>>,
  ): Job {
    const job = this.jobs.get(id);
    if (!job) throw new Error(`Job ${id} not found`);
    Object.assign(job, patch, { updatedAt: new Date() });
    return job;
  }

  complete(id: string, result?: any): Job {
    return this.update(id, {
      status: 'completed',
      progress: 100,
      message: 'Completed successfully',
      result,
    });
  }

  fail(id: string, error: string): Job {
    return this.update(id, {
      status: 'failed',
      progress: 0,
      message: `Failed: ${error}`,
      error,
    });
  }
}
