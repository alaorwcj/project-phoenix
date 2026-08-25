import { FastifyRequest, FastifyReply } from 'fastify';
import { createContainerService } from '../services/containerService';
import { getJobQueue, JobType, ContainerStartJobData, ContainerStopJobData } from '../lib/jobQueue';
import { PrismaClient } from '@prisma/client';
import { type StructuredLogger } from '../lib/logger';
import { getRequestTraceId } from '../lib/trace';
import { validateBody, StartContainerSchema, StopContainerSchema } from '../lib/validation';
import { checkRateLimit, RATE_LIMITS } from '../lib/rateLimit';
import { writeAuditLog } from '../lib/audit';
import { checkResourceAllocation } from '../lib/resourceManager';

const containerService = createContainerService();
const prisma = new PrismaClient();

export async function startContainerHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const { tenantId, id: userId } = request.user as any;

    if (!request.body) {
      return reply.status(400).send({ error: 'Request body required' });
    }

    // Rate limit check
    const rl = checkRateLimit('tenant:container-ops:' + tenantId, RATE_LIMITS.CONTAINER_OPS);
    if (!rl.allowed) {
      reply.header('Retry-After', Math.ceil((rl.retryAfterMs ?? 60000) / 1000).toString());
      return reply.status(429).send({ error: 'Rate limit exceeded', retryAfterMs: rl.retryAfterMs });
    }

    // Validate input
    const validation = validateBody(StartContainerSchema, request.body);
    if ('error' in validation) {
      return reply.status(400).send({ error: validation.error });
    }

    const { name, image, hostId, environmentVars, resourceLimits, portBindings } = validation.data;

    // Check resource allocation on target host
    const allocation = await checkResourceAllocation(hostId, tenantId, {
      cpuShares: resourceLimits?.cpuShares,
      memory: resourceLimits?.memory,
    });

    if (!allocation.allowed) {
      await writeAuditLog({
        tenantId,
        userId,
        action: 'CONTAINER_START',
        resource: 'container',
        metadata: { name, image, hostId, reason: allocation.reason },
        result: 'failure',
        error: allocation.reason,
      });
      return reply.status(402).send({
        error: 'Insufficient host capacity',
        details: allocation.reason,
        remaining: allocation.remaining,
      });
    }

    // Create container in PENDING state
    const container = await containerService.startContainer(tenantId, {
      name,
      image,
      hostId,
      environmentVars: environmentVars || {},
      resourceLimits: (resourceLimits || {}) as any,
      portBindings: (portBindings || {}) as any,
    });

    // Enqueue job to handle actual container creation
    const jobQueue = getJobQueue();
    const jobData: ContainerStartJobData = {
      containerId: container.id,
      tenantId,
      hostId,
      image,
      environmentVars: environmentVars || {},
      resourceLimits: (resourceLimits || {}) as any,
    };

    const job = await jobQueue.enqueueJob(JobType.CONTAINER_START, jobData, {
      priority: 5,
      delay: 1000, // Give DB a moment to settle
      traceId: getRequestTraceId(request as unknown as object),
    });

    await writeAuditLog({
      tenantId,
      userId,
      action: 'CONTAINER_START',
      resource: 'container',
      resourceId: container.id,
      metadata: { name, image, hostId, jobId: job.id },
      result: 'success',
    });

    return reply.status(201).send({
      ...container,
      jobId: job.id,
      jobStatus: 'queued',
    });
  } catch (error) {
    const { tenantId, id: userId } = (request.user as any) ?? {};
    (request.log as unknown as StructuredLogger).error({ err: error }, 'Error starting container');
    await writeAuditLog({
      tenantId: tenantId ?? 'unknown',
      userId,
      action: 'CONTAINER_START',
      resource: 'container',
      metadata: { error: (error as Error).message },
      result: 'failure',
      error: (error as Error).message,
    });
    return reply.status(500).send({ error: (error as Error).message || 'Failed to start container' });
  }
}

export async function stopContainerHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const { tenantId, id: userId } = request.user as any;

    if (!request.body) {
      return reply.status(400).send({ error: 'Request body required' });
    }

    // Rate limit check
    const rl = checkRateLimit('tenant:container-ops:' + tenantId, RATE_LIMITS.CONTAINER_OPS);
    if (!rl.allowed) {
      reply.header('Retry-After', Math.ceil((rl.retryAfterMs ?? 60000) / 1000).toString());
      return reply.status(429).send({ error: 'Rate limit exceeded', retryAfterMs: rl.retryAfterMs });
    }

    // Validate input
    const validation = validateBody(StopContainerSchema, request.body);
    if ('error' in validation) {
      return reply.status(400).send({ error: validation.error });
    }

    const { containerId, timeoutSeconds } = validation.data;

    // Verify container belongs to tenant and get current state
    await containerService.getContainer(tenantId, containerId);

    // Update to STOPPING immediately for UI feedback
    const stoppingContainer = await containerService.updateContainerStatus(
      tenantId,
      containerId,
      'STOPPING'
    );

    // Enqueue job to handle actual container stop
    const jobQueue = getJobQueue();
    const jobData: ContainerStopJobData = {
      containerId,
      tenantId,
      timeoutSeconds: timeoutSeconds || 15,
    };

    const job = await jobQueue.enqueueJob(JobType.CONTAINER_STOP, jobData, {
      priority: 5,
      traceId: getRequestTraceId(request as unknown as object),
    });

    await writeAuditLog({
      tenantId,
      userId,
      action: 'CONTAINER_STOP',
      resource: 'container',
      resourceId: containerId,
      metadata: { timeoutSeconds: timeoutSeconds || 15, jobId: job.id },
      result: 'success',
    });

    return reply.status(200).send({
      ...stoppingContainer,
      jobId: job.id,
      jobStatus: 'queued',
    });
  } catch (error) {
    const { tenantId, id: userId } = (request.user as any) ?? {};
    (request.log as unknown as StructuredLogger).error({ err: error }, 'Error stopping container');

    await writeAuditLog({
      tenantId: tenantId ?? 'unknown',
      userId,
      action: 'CONTAINER_STOP',
      resource: 'container',
      metadata: { error: (error as Error).message },
      result: 'failure',
      error: (error as Error).message,
    });

    if ((error as Error).message.includes('not found')) {
      return reply.status(404).send({ error: 'Container not found' });
    }

    return reply.status(500).send({ error: (error as Error).message || 'Failed to stop container' });
  }
}

export async function getContainerHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const { tenantId } = request.user as any;
    const { id } = request.params as { id: string };

    if (!id) {
      return reply.status(400).send({ error: 'Container ID required' });
    }

    const container = await containerService.getContainer(tenantId, id);
    return reply.status(200).send(container);
  } catch (error) {
    (request.log as unknown as StructuredLogger).error({ err: error }, 'Error getting container');
    
    if ((error as Error).message.includes('not found')) {
      return reply.status(404).send({ error: 'Container not found' });
    }

    return reply.status(500).send({ error: (error as Error).message || 'Failed to get container' });
  }
}

export async function listContainersHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const { tenantId } = request.user as any;
    const { hostId } = request.query as { hostId?: string };

    let containers;
    
    if (hostId) {
      // Verify the host belongs to the tenant
      const host = await prisma.host.findFirst({
        where: { id: hostId, tenantId },
      });

      if (!host) {
        return reply.status(404).send({ error: 'Host not found' });
      }

      containers = await containerService.listContainers(tenantId, hostId);
    } else {
      containers = await containerService.listContainers(tenantId);
    }

    return reply.status(200).send({
      containers,
      total: containers.length,
    });
  } catch (error) {
    (request.log as unknown as StructuredLogger).error({ err: error }, 'Error listing containers');
    return reply.status(500).send({ error: (error as Error).message || 'Failed to list containers' });
  }
}
