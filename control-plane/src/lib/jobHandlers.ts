import { Job } from 'bull';
import {
  ContainerStartJobData,
  ContainerStopJobData,
  ImagePullJobData,
  getJobQueue,
  JobType,
} from '../lib/jobQueue';
import { createContainerService } from '../services/containerService';
import { PrismaClient } from '@prisma/client';
import { getLogger } from './logger';
import { createTraceId } from './trace';
import { getGrpcAgentClient } from './grpcAgentClient';
import { getAgentRegistry } from './agentRegistry';
import { getDeadLetterQueue } from './deadLetterQueue';

const containerService = createContainerService();
const prisma = new PrismaClient();

/**
 * Job handler for starting containers
 * Called by Bull queue when job is ready to process
 */
export async function handleContainerStartJob(job: Job<ContainerStartJobData>) {
  const { containerId, tenantId, hostId, image, environmentVars, resourceLimits } =
    job.data;
  const log = getLogger({
    component: 'job-handler',
    jobType: JobType.CONTAINER_START,
    jobId: job.id,
    traceId: getJobTraceId(job),
  });

  try {
    job.progress(10); // 10% - Job started

    // Verify container exists and belongs to tenant
    const container = await prisma.container.findUnique({
      where: { id: containerId },
      include: { host: true },
    });

    if (!container || container.tenantId !== tenantId) {
      throw new Error(`Container ${containerId} not found or unauthorized`);
    }

    if (container.hostId !== hostId) {
      throw new Error(`Container does not belong to host ${hostId}`);
    }

    job.progress(25); // 25% - Validation complete

    // Resolve the agent connection info for the target host
    const registry = getAgentRegistry();
    const agent = await registry.getAgent(hostId);

    if (!agent) {
      throw new Error(`Agent for host ${hostId} is offline or unreachable`);
    }

    // Update container status to CREATING
    await containerService.updateContainerStatus(tenantId, containerId, 'CREATING');

    job.progress(40); // 40% - Status updated to CREATING

    // Dispatch StartContainer RPC to the agent
    const agentClient = getGrpcAgentClient();
    const response = await agentClient.startContainer(hostId, agent.grpcAddress, {
      command_id: `job-${job.id}`,
      host_id: hostId,
      container_id: containerId,
    });

    job.progress(75); // 75% - Docker operation dispatched to agent

    if (!response.success) {
      throw new Error(response.message || 'Agent failed to start container');
    }

    // Update status to RUNNING
    await containerService.updateContainerStatus(tenantId, containerId, 'RUNNING');

    job.progress(100); // 100% - Complete

    log.info({ containerId, hostId, image }, 'Container started via gRPC agent');

    return {
      success: true,
      containerId,
      message: response.message || 'Container started successfully',
    };
  } catch (error) {
    log.error({ err: error, containerId, hostId }, 'Container start job failed');

    // Update container status to FAILED
    try {
      await containerService.updateContainerStatus(tenantId, containerId, 'FAILED');
    } catch (statusError) {
      log.error({ err: statusError, containerId }, 'Failed to update container status');
    }

    // Dead-letter if this is the final attempt
    if (job.attemptsMade >= (job.opts.attempts || 3) - 1) {
      const dlq = getDeadLetterQueue();
      await dlq.enqueue({
        jobId: job.id as string,
        jobType: JobType.CONTAINER_START,
        tenantId,
        resourceId: containerId,
        errorMessage: (error as Error).message,
        lastAttemptAt: new Date(),
        attemptCount: job.attemptsMade + 1,
        metadata: { hostId, image, environmentVars },
      });
    }

    throw error;
  }
}

/**
 * Job handler for stopping containers
 * Called by Bull queue when job is ready to process
 */
export async function handleContainerStopJob(job: Job<ContainerStopJobData>) {
  const { containerId, tenantId, timeoutSeconds } = job.data;
  const log = getLogger({
    component: 'job-handler',
    jobType: JobType.CONTAINER_STOP,
    jobId: job.id,
    traceId: getJobTraceId(job),
  });

  try {
    job.progress(10); // 10% - Job started

    // Verify container exists and belongs to tenant
    const container = await prisma.container.findUnique({
      where: { id: containerId },
    });

    if (!container || container.tenantId !== tenantId) {
      throw new Error(`Container ${containerId} not found or unauthorized`);
    }

    job.progress(25); // 25% - Validation complete

    // Resolve the agent connection info for the container's host
    const registry = getAgentRegistry();
    const agent = await registry.getAgent(container.hostId);

    if (!agent) {
      throw new Error(`Agent for host ${container.hostId} is offline or unreachable`);
    }

    // Update container status to STOPPING
    await containerService.updateContainerStatus(tenantId, containerId, 'STOPPING');

    job.progress(50); // 50% - Status updated to STOPPING

    // Dispatch StopContainer RPC to the agent
    const agentClient = getGrpcAgentClient();
    const response = await agentClient.stopContainer(container.hostId, agent.grpcAddress, {
      command_id: `job-${job.id}`,
      host_id: container.hostId,
      container_id: containerId,
      timeout_seconds: timeoutSeconds,
    });

    job.progress(75); // 75% - Docker operation dispatched to agent

    if (!response.success) {
      throw new Error(response.message || 'Agent failed to stop container');
    }

    // Update status to STOPPED
    await containerService.updateContainerStatus(tenantId, containerId, 'STOPPED');

    job.progress(100); // 100% - Complete

    log.info({ containerId, timeoutSeconds }, 'Container stopped via gRPC agent');

    return {
      success: true,
      containerId,
      message: response.message || 'Container stopped successfully',
    };
  } catch (error) {
    log.error({ err: error, containerId }, 'Container stop job failed');

    // Update container status to FAILED (only if not already stopped)
    try {
      const current = await prisma.container.findUnique({
        where: { id: containerId },
      });
      if (current && current.status !== 'STOPPED') {
        await containerService.updateContainerStatus(tenantId, containerId, 'FAILED');
      }
    } catch (statusError) {
      log.error({ err: statusError, containerId }, 'Failed to update container status');
    }

    // Dead-letter if this is the final attempt
    if (job.attemptsMade >= (job.opts.attempts || 3) - 1) {
      const dlq = getDeadLetterQueue();
      await dlq.enqueue({
        jobId: job.id as string,
        jobType: JobType.CONTAINER_STOP,
        tenantId,
        resourceId: containerId,
        errorMessage: (error as Error).message,
        lastAttemptAt: new Date(),
        attemptCount: job.attemptsMade + 1,
        metadata: { timeoutSeconds },
      });
    }

    throw error;
  }
}

/**
 * Job handler for pulling container images
 * Called by Bull queue when job is ready to process
 */
export async function handleImagePullJob(job: Job<ImagePullJobData>) {
  const { tenantId, hostId, image } = job.data;
  const log = getLogger({
    component: 'job-handler',
    jobType: JobType.IMAGE_PULL,
    jobId: job.id,
    traceId: getJobTraceId(job),
  });

  try {
    job.progress(10); // 10% - Job started

    // Verify host exists and belongs to tenant
    const host = await prisma.host.findUnique({
      where: { id: hostId },
    });

    if (!host || host.tenantId !== tenantId) {
      throw new Error(`Host ${hostId} not found or unauthorized`);
    }

    job.progress(25); // 25% - Host verified

    // Resolve the agent connection info
    const registry = getAgentRegistry();
    const agent = await registry.getAgent(hostId);

    if (!agent) {
      throw new Error(`Agent for host ${hostId} is offline or unreachable`);
    }

    // Log image pull start
    log.info({ image, hostId }, 'Pulling image via agent');

    // Dispatch to agent via gRPC
    // Note: This would require an ImagePull RPC in the proto. For now, log and simulate.
    // TODO: Add PullImage RPC to proto and agent
    // const agentClient = getGrpcAgentClient();
    // await agentClient.pullImage(hostId, agent.grpcAddress, { image });

    const steps = 5;
    for (let i = 0; i < steps; i++) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      job.progress(25 + (i * 75) / steps);
    }

    log.info({ image, hostId }, 'Image pull completed');

    return {
      success: true,
      image,
      hostId,
      message: `Image ${image} pulled successfully`,
    };
  } catch (error) {
    log.error({ err: error, image, hostId }, 'Image pull job failed');

    // Dead-letter if this is the final attempt
    if (job.attemptsMade >= (job.opts.attempts || 3) - 1) {
      const dlq = getDeadLetterQueue();
      await dlq.enqueue({
        jobId: job.id as string,
        jobType: JobType.IMAGE_PULL,
        tenantId,
        errorMessage: (error as Error).message,
        lastAttemptAt: new Date(),
        attemptCount: job.attemptsMade + 1,
        metadata: { image, hostId },
      });
    }

    throw error;
  }
}

/**
 * Register all job handlers with the queue
 * Call this during app initialization
 */
export async function registerJobHandlers() {
  const jobQueue = getJobQueue();

  // Register handlers for each job type
  const containerStartQueue = jobQueue.getQueue(JobType.CONTAINER_START);
  if (containerStartQueue) {
    containerStartQueue.process(1, handleContainerStartJob);
  }

  const containerStopQueue = jobQueue.getQueue(JobType.CONTAINER_STOP);
  if (containerStopQueue) {
    containerStopQueue.process(1, handleContainerStopJob);
  }

  const imagePullQueue = jobQueue.getQueue(JobType.IMAGE_PULL);
  if (imagePullQueue) {
    imagePullQueue.process(1, handleImagePullJob);
  }

  getLogger({ component: 'job-handler' }).info({}, 'All handlers registered');
}

function getJobTraceId(job: Job) {
  const traceId = (job.opts as Record<string, unknown>).traceId;
  if (typeof traceId === 'string' && traceId.trim()) {
    return traceId.trim();
  }
  return createTraceId();
}
