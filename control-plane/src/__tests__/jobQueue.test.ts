import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { PrismaClient } from '@prisma/client';
import {
  initializeJobQueue,
  getJobQueue,
  JobType,
  ContainerStartJobData,
  ContainerStopJobData,
} from '../lib/jobQueue';
import { registerJobHandlers } from '../lib/jobHandlers';

const prisma = new PrismaClient();

describe('Job Queue System', () => {
  let tenantId: string;
  let hostId: string;
  let containerId: string;

  beforeAll(async () => {
    // Initialize job queue
    await initializeJobQueue();
    await registerJobHandlers();

    // Clean up test data
    await prisma.container.deleteMany({});
    await prisma.host.deleteMany({});
    await prisma.user.deleteMany({});
    await prisma.tenant.deleteMany({});

    // Create test tenant
    const tenant = await prisma.tenant.create({
      data: {
        name: 'Job Queue Test Tenant',
        slug: 'job-queue-test',
        createdAt: new Date(),
      },
    });
    tenantId = tenant.id;

    // Create test host
    const host = await prisma.host.create({
      data: {
        name: 'test-job-host',
        hostname: 'job-host.local',
        agentId: 'agent-job-test',
        status: 'ONLINE',
        dockerVersion: '24.0.7',
        tenantId,
        metadata: {},
        lastHeartbeat: new Date(),
        createdAt: new Date(),
      },
    });
    hostId = host.id;

    // Create test container
    const container = await prisma.container.create({
      data: {
        tenantId,
        hostId,
        dockerId: 'sha256:job-test',
        name: 'job-test-container',
        image: 'nginx:latest',
        status: 'PENDING',
        createdAt: new Date(),
      },
    });
    containerId = container.id;
  });

  afterAll(async () => {
    // Clean up
    const jobQueue = getJobQueue();
    await jobQueue.closeQueues();

    await prisma.container.deleteMany({});
    await prisma.host.deleteMany({});
    await prisma.user.deleteMany({});
    await prisma.tenant.deleteMany({});
    await prisma.$disconnect();
  });

  describe('Job Enqueueing', () => {
    it('should enqueue a container start job', async () => {
      const jobQueue = getJobQueue();
      const jobData: ContainerStartJobData = {
        containerId,
        tenantId,
        hostId,
        image: 'nginx:latest',
        environmentVars: { ENV: 'test' },
      };

      const job = await jobQueue.enqueueJob(JobType.CONTAINER_START, jobData);

      expect(job).toBeDefined();
      expect(job.id).toBeDefined();
      expect(job.data).toEqual(jobData);
    });

    it('should enqueue a container stop job', async () => {
      const jobQueue = getJobQueue();
      const jobData: ContainerStopJobData = {
        containerId,
        tenantId,
        timeoutSeconds: 15,
      };

      const job = await jobQueue.enqueueJob(JobType.CONTAINER_STOP, jobData);

      expect(job).toBeDefined();
      expect(job.id).toBeDefined();
      expect(job.data).toEqual(jobData);
    });

    it('should enqueue job with priority', async () => {
      const jobQueue = getJobQueue();
      const jobData: ContainerStartJobData = {
        containerId,
        tenantId,
        hostId,
        image: 'nginx:latest',
        environmentVars: {},
      };

      const job = await jobQueue.enqueueJob(JobType.CONTAINER_START, jobData, {
        priority: 1,
      });

      expect(job.opts.priority).toBe(1);
    });

    it('should enqueue job with delay', async () => {
      const jobQueue = getJobQueue();
      const jobData: ContainerStartJobData = {
        containerId,
        tenantId,
        hostId,
        image: 'nginx:latest',
        environmentVars: {},
      };

      const job = await jobQueue.enqueueJob(JobType.CONTAINER_START, jobData, {
        delay: 5000,
      });

      expect(job.opts.delay).toBe(5000);
    });
  });

  describe('Job Status Tracking', () => {
    it('should retrieve job status', async () => {
      const jobQueue = getJobQueue();
      const jobData: ContainerStartJobData = {
        containerId,
        tenantId,
        hostId,
        image: 'nginx:latest',
        environmentVars: {},
      };

      const job = await jobQueue.enqueueJob(JobType.CONTAINER_START, jobData);
      const status = await jobQueue.getJobStatus(JobType.CONTAINER_START, job.id as string);

      expect(status).toBeDefined();
      expect(status?.id).toBe(job.id);
      expect(status?.type).toBe(JobType.CONTAINER_START);
      expect(['pending', 'processing', 'completed', 'failed']).toContain(status?.status);
    });

    it('should return null for non-existent job', async () => {
      const jobQueue = getJobQueue();
      const status = await jobQueue.getJobStatus(JobType.CONTAINER_START, 'non-existent-id');

      expect(status).toBeNull();
    });

    it('should track job attempts', async () => {
      const jobQueue = getJobQueue();
      const jobData: ContainerStartJobData = {
        containerId,
        tenantId,
        hostId,
        image: 'nginx:latest',
        environmentVars: {},
      };

      const job = await jobQueue.enqueueJob(JobType.CONTAINER_START, jobData);
      const status = await jobQueue.getJobStatus(JobType.CONTAINER_START, job.id as string);

      expect(status?.attempts).toBeLessThanOrEqual((status?.maxAttempts || 0));
    });
  });

  describe('Job Listing', () => {
    it('should list jobs by type', async () => {
      const jobQueue = getJobQueue();
      const jobData: ContainerStartJobData = {
        containerId,
        tenantId,
        hostId,
        image: 'nginx:latest',
        environmentVars: {},
      };

      await jobQueue.enqueueJob(JobType.CONTAINER_START, jobData);

      const jobs = await jobQueue.listJobs(JobType.CONTAINER_START, undefined, 50);

      expect(Array.isArray(jobs)).toBe(true);
      expect(jobs.length).toBeGreaterThan(0);
    });

    it('should list jobs by status', async () => {
      const jobQueue = getJobQueue();

      const jobs = await jobQueue.listJobs(JobType.CONTAINER_START, 'pending', 50);

      expect(Array.isArray(jobs)).toBe(true);
    });

    it('should respect limit parameter', async () => {
      const jobQueue = getJobQueue();
      const limit = 5;

      const jobs = await jobQueue.listJobs(JobType.CONTAINER_START, undefined, limit);

      expect(jobs.length).toBeLessThanOrEqual(limit);
    });
  });

  describe('Job Retry Logic', () => {
    it('should retry failed jobs', async () => {
      const jobQueue = getJobQueue();
      const jobData: ContainerStartJobData = {
        containerId,
        tenantId,
        hostId,
        image: 'nginx:latest',
        environmentVars: {},
      };

      const job = await jobQueue.enqueueJob(JobType.CONTAINER_START, jobData);

      // Retry should succeed without throwing
      await expect(
        jobQueue.retryJob(JobType.CONTAINER_START, job.id as string)
      ).resolves.not.toThrow();
    });

    it('should throw error on retry of non-existent job', async () => {
      const jobQueue = getJobQueue();

      await expect(
        jobQueue.retryJob(JobType.CONTAINER_START, 'non-existent-id')
      ).rejects.toThrow();
    });
  });

  describe('Job Cancellation', () => {
    it('should remove jobs', async () => {
      const jobQueue = getJobQueue();
      const jobData: ContainerStartJobData = {
        containerId,
        tenantId,
        hostId,
        image: 'nginx:latest',
        environmentVars: {},
      };

      const job = await jobQueue.enqueueJob(JobType.CONTAINER_START, jobData);

      await jobQueue.removeJob(JobType.CONTAINER_START, job.id as string);

      const status = await jobQueue.getJobStatus(JobType.CONTAINER_START, job.id as string);
      expect(status).toBeNull();
    });

    it('should throw error on removal of non-existent job', async () => {
      const jobQueue = getJobQueue();

      await expect(
        jobQueue.removeJob(JobType.CONTAINER_START, 'non-existent-id')
      ).rejects.toThrow();
    });
  });

  describe('Job Queue Configuration', () => {
    it('should have exponential backoff enabled', async () => {
      const jobQueue = getJobQueue();
      const queue = jobQueue.getQueue(JobType.CONTAINER_START);

      expect(queue).toBeDefined();
      expect(queue?.opts.defaultJobOptions?.backoff).toEqual({
        type: 'exponential',
        delay: 2000,
      });
    });

    it('should remove completed jobs automatically', async () => {
      const jobQueue = getJobQueue();
      const queue = jobQueue.getQueue(JobType.CONTAINER_START);

      expect(queue?.opts.defaultJobOptions?.removeOnComplete).toBe(true);
    });

    it('should keep failed jobs for debugging', async () => {
      const jobQueue = getJobQueue();
      const queue = jobQueue.getQueue(JobType.CONTAINER_START);

      expect(queue?.opts.defaultJobOptions?.removeOnFail).toBe(false);
    });
  });

  describe('Job Handler Integration', () => {
    it('should process container start job', async () => {
      const jobQueue = getJobQueue();
      const jobData: ContainerStartJobData = {
        containerId,
        tenantId,
        hostId,
        image: 'nginx:latest',
        environmentVars: { TEST: 'value' },
      };

      const job = await jobQueue.enqueueJob(JobType.CONTAINER_START, jobData);

      // Wait a bit for job to be processed
      await new Promise((resolve) => setTimeout(resolve, 3000));

      const status = await jobQueue.getJobStatus(JobType.CONTAINER_START, job.id as string);

      // Job should either be completed or still processing
      expect(['completed', 'processing']).toContain(status?.status);
    });

    it('should process container stop job', async () => {
      const jobQueue = getJobQueue();
      const jobData: ContainerStopJobData = {
        containerId,
        tenantId,
        timeoutSeconds: 15,
      };

      const job = await jobQueue.enqueueJob(JobType.CONTAINER_STOP, jobData);

      // Wait a bit for job to be processed
      await new Promise((resolve) => setTimeout(resolve, 3000));

      const status = await jobQueue.getJobStatus(JobType.CONTAINER_STOP, job.id as string);

      // Job should either be completed or still processing
      expect(['completed', 'processing']).toContain(status?.status);
    });
  });
});
