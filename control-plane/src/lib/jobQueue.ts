import Queue, { Queue as BullQueue, Job, JobOptions } from 'bull';
import { env } from '../config/env';

export enum JobType {
  CONTAINER_START = 'container:start',
  CONTAINER_STOP = 'container:stop',
  IMAGE_PULL = 'image:pull',
}

export interface ContainerStartJobData {
  containerId: string;
  tenantId: string;
  hostId: string;
  image: string;
  environmentVars: Record<string, string>;
  resourceLimits?: {
    memoryLimitBytes?: number;
    cpuQuota?: number;
  };
}

export interface ContainerStopJobData {
  containerId: string;
  tenantId: string;
  timeoutSeconds: number;
}

export interface ImagePullJobData {
  tenantId: string;
  hostId: string;
  image: string;
}

export type JobData = ContainerStartJobData | ContainerStopJobData | ImagePullJobData;

export interface JobStatus {
  id: string;
  type: JobType;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  attempts: number;
  maxAttempts: number;
  error?: string;
  result?: any;
  createdAt: Date;
  completedAt?: Date;
}

class JobQueueManager {
  private queues: Map<JobType, BullQueue> = new Map();
  private redisConfig = {
    host: env.REDIS_HOST || 'localhost',
    port: env.REDIS_PORT || 6379,
    password: env.REDIS_PASSWORD,
  };

  async initialize() {
    // Create queues for each job type
    for (const jobType of Object.values(JobType)) {
      const queue = new Queue(jobType, {
        redis: this.redisConfig,
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
          removeOnComplete: true,
          removeOnFail: false,
        },
      });

      // Event listeners
      queue.on('active', (job: Job) => {
        console.log(`[${jobType}] Job ${job.id} started processing`);
      });

      queue.on('completed', (job: Job) => {
        console.log(`[${jobType}] Job ${job.id} completed`, job.returnvalue);
      });

      queue.on('failed', (job: Job, err: Error) => {
        console.error(`[${jobType}] Job ${job.id} failed:`, err.message);
      });

      this.queues.set(jobType, queue);
    }
  }

  async enqueueJob<T extends JobData>(
    jobType: JobType,
    data: T,
    options?: JobOptions
  ): Promise<Job<T>> {
    const queue = this.queues.get(jobType);
    if (!queue) {
      throw new Error(`Queue not initialized for job type: ${jobType}`);
    }

    return queue.add(data, {
      ...options,
      jobId: `${jobType}-${data.tenantId}-${Date.now()}`,
    });
  }

  getQueue(jobType: JobType): BullQueue | undefined {
    return this.queues.get(jobType);
  }

  async getJobStatus(jobType: JobType, jobId: string): Promise<JobStatus | null> {
    const queue = this.queues.get(jobType);
    if (!queue) return null;

    const job = await queue.getJob(jobId);
    if (!job) return null;

    const state = await job.getState();
    const progress = job.progress();

    return {
      id: job.id as string,
      type: jobType,
      status: state as any,
      progress: typeof progress === 'number' ? progress : 0,
      attempts: job.attemptsMade,
      maxAttempts: job.opts.attempts || 3,
      error: job.failedReason,
      result: job.returnvalue,
      createdAt: new Date(job.timestamp),
      completedAt: job.finishedOn ? new Date(job.finishedOn) : undefined,
    };
  }

  async listJobs(jobType: JobType, status?: string, limit: number = 50) {
    const queue = this.queues.get(jobType);
    if (!queue) return [];

    if (status) {
      return queue.getJobs([status as any], 0, limit - 1, 'asc');
    }

    const jobs = await Promise.all([
      queue.getJobs(['pending'], 0, limit - 1),
      queue.getJobs(['active'], 0, limit - 1),
      queue.getJobs(['completed'], 0, limit - 1),
      queue.getJobs(['failed'], 0, limit - 1),
    ]);

    return jobs.flat().slice(0, limit);
  }

  async retryJob(jobType: JobType, jobId: string) {
    const queue = this.queues.get(jobType);
    if (!queue) throw new Error(`Queue not found: ${jobType}`);

    const job = await queue.getJob(jobId);
    if (!job) throw new Error(`Job not found: ${jobId}`);

    await job.retry();
  }

  async removeJob(jobType: JobType, jobId: string) {
    const queue = this.queues.get(jobType);
    if (!queue) throw new Error(`Queue not found: ${jobType}`);

    const job = await queue.getJob(jobId);
    if (!job) throw new Error(`Job not found: ${jobId}`);

    await job.remove();
  }

  async closeQueues() {
    await Promise.all(
      Array.from(this.queues.values()).map((queue) => queue.close())
    );
  }
}

// Singleton instance
let jobQueueManager: JobQueueManager;

export async function initializeJobQueue(): Promise<JobQueueManager> {
  if (!jobQueueManager) {
    jobQueueManager = new JobQueueManager();
    await jobQueueManager.initialize();
  }
  return jobQueueManager;
}

export function getJobQueue(): JobQueueManager {
  if (!jobQueueManager) {
    throw new Error('Job queue not initialized. Call initializeJobQueue() first.');
  }
  return jobQueueManager;
}

export default JobQueueManager;
