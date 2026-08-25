import { FastifyRequest, FastifyReply } from 'fastify';
import { getJobQueue, JobType } from '../lib/jobQueue';
import { type StructuredLogger } from '../lib/logger';

export async function getJobStatusHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const { tenantId } = request.user as any;
    const { jobType, jobId } = request.params as { jobType: string; jobId: string };

    if (!Object.values(JobType).includes(jobType as JobType)) {
      return reply.status(400).send({ error: 'Invalid job type' });
    }

    const jobQueue = getJobQueue();
    const status = await jobQueue.getJobStatus(jobType as JobType, jobId);

    if (!status) {
      return reply.status(404).send({ error: 'Job not found' });
    }

    return reply.status(200).send(status);
  } catch (error) {
    (request.log as unknown as StructuredLogger).error({ err: error }, 'Error getting job status');
    return reply.status(500).send({ error: (error as Error).message });
  }
}

export async function listJobsHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const { tenantId } = request.user as any;
    const { jobType, status, limit } = request.query as {
      jobType?: string;
      status?: string;
      limit?: string;
    };

    if (!jobType || !Object.values(JobType).includes(jobType as JobType)) {
      return reply.status(400).send({ error: 'jobType parameter required and must be valid' });
    }

    const jobQueue = getJobQueue();
    const jobs = await jobQueue.listJobs(jobType as JobType, status, parseInt(limit || '50'));

    const jobStatuses = await Promise.all(
      jobs.map((job) =>
        jobQueue.getJobStatus(jobType as JobType, job.id as string)
      )
    );

    return reply.status(200).send({
      jobType,
      status: status || 'all',
      jobs: jobStatuses.filter((j) => j !== null),
      total: jobStatuses.length,
    });
  } catch (error) {
    (request.log as unknown as StructuredLogger).error({ err: error }, 'Error listing jobs');
    return reply.status(500).send({ error: (error as Error).message });
  }
}

export async function retryJobHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const { tenantId } = request.user as any;
    const { jobType, jobId } = request.params as { jobType: string; jobId: string };

    if (!Object.values(JobType).includes(jobType as JobType)) {
      return reply.status(400).send({ error: 'Invalid job type' });
    }

    const jobQueue = getJobQueue();
    await jobQueue.retryJob(jobType as JobType, jobId);

    const status = await jobQueue.getJobStatus(jobType as JobType, jobId);

    return reply.status(200).send({
      message: 'Job retried',
      job: status,
    });
  } catch (error) {
    (request.log as unknown as StructuredLogger).error({ err: error }, 'Error retrying job');

    if ((error as Error).message.includes('not found')) {
      return reply.status(404).send({ error: 'Job not found' });
    }

    return reply.status(500).send({ error: (error as Error).message });
  }
}

export async function cancelJobHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const { tenantId } = request.user as any;
    const { jobType, jobId } = request.params as { jobType: string; jobId: string };

    if (!Object.values(JobType).includes(jobType as JobType)) {
      return reply.status(400).send({ error: 'Invalid job type' });
    }

    const jobQueue = getJobQueue();
    await jobQueue.removeJob(jobType as JobType, jobId);

    return reply.status(200).send({
      message: 'Job cancelled',
      jobId,
    });
  } catch (error) {
    (request.log as unknown as StructuredLogger).error({ err: error }, 'Error cancelling job');

    if ((error as Error).message.includes('not found')) {
      return reply.status(404).send({ error: 'Job not found' });
    }

    return reply.status(500).send({ error: (error as Error).message });
  }
}
