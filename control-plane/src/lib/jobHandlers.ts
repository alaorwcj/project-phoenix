import { Job } from 'bull';
import {
  ContainerStartJobData,
  ContainerStopJobData,
  ImagePullJobData,
  getJobQueue,
  JobType,
} from '../lib/jobQueue';
import { createContainerService } from './containerService';
import { PrismaClient } from '@prisma/client';

const containerService = createContainerService();
const prisma = new PrismaClient();

/**
 * Job handler for starting containers
 * Called by Bull queue when job is ready to process
 */
export async function handleContainerStartJob(job: Job<ContainerStartJobData>) {
  const { containerId, tenantId, hostId, image, environmentVars, resourceLimits } =
    job.data;

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

    // Update container status to CREATING
    await containerService.updateContainerStatus(tenantId, containerId, 'CREATING');

    job.progress(40); // 40% - Status updated to CREATING

    // Call gRPC agent to start the container
    // TODO: Implement actual gRPC call to agent
    console.log(
      `[ContainerStartJob] Would call gRPC to start container ${containerId} on host ${hostId}`
    );

    // Simulate agent work
    await new Promise((resolve) => setTimeout(resolve, 2000));

    job.progress(75); // 75% - Docker operation in progress

    // Update status to RUNNING
    await containerService.updateContainerStatus(tenantId, containerId, 'RUNNING');

    job.progress(100); // 100% - Complete

    return {
      success: true,
      containerId,
      message: 'Container started successfully',
    };
  } catch (error) {
    console.error('[ContainerStartJob] Error:', error);

    // Update container status to FAILED
    try {
      await containerService.updateContainerStatus(tenantId, containerId, 'FAILED');
    } catch (statusError) {
      console.error('[ContainerStartJob] Failed to update status:', statusError);
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

    // Update container status to STOPPING
    await containerService.updateContainerStatus(tenantId, containerId, 'STOPPING');

    job.progress(50); // 50% - Status updated to STOPPING

    // Call gRPC agent to stop the container
    // TODO: Implement actual gRPC call to agent
    console.log(
      `[ContainerStopJob] Would call gRPC to stop container ${containerId} with timeout ${timeoutSeconds}s`
    );

    // Simulate agent work
    await new Promise((resolve) => setTimeout(resolve, Math.min(timeoutSeconds * 1000, 5000)));

    job.progress(75); // 75% - Docker operation complete

    // Update status to STOPPED
    await containerService.updateContainerStatus(tenantId, containerId, 'STOPPED');

    job.progress(100); // 100% - Complete

    return {
      success: true,
      containerId,
      message: 'Container stopped successfully',
    };
  } catch (error) {
    console.error('[ContainerStopJob] Error:', error);

    // Update container status to FAILED (only if not already stopped)
    try {
      const current = await prisma.container.findUnique({
        where: { id: containerId },
      });
      if (current && current.status !== 'STOPPED') {
        await containerService.updateContainerStatus(tenantId, containerId, 'FAILED');
      }
    } catch (statusError) {
      console.error('[ContainerStopJob] Failed to update status:', statusError);
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

    // Log image pull start
    console.log(`[ImagePullJob] Pulling image ${image} on host ${hostId}`);

    // Call gRPC agent to pull the image
    // TODO: Implement actual gRPC call to agent
    // For now, just simulate the pull
    const steps = 5;
    for (let i = 0; i < steps; i++) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      job.progress(25 + (i * 75) / steps);
    }

    return {
      success: true,
      image,
      hostId,
      message: `Image ${image} pulled successfully`,
    };
  } catch (error) {
    console.error('[ImagePullJob] Error:', error);
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

  console.log('[JobHandlers] All handlers registered');
}
