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
import { recordContainerStart, recordContainerStop } from '../lib/costTracking';
import { parsePaginationParams, buildPaginatedResponse } from '../lib/pagination';
import { getGrpcAgentClient } from '../lib/grpcAgentClient';
import { getAgentRegistry } from '../lib/agentRegistry';

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

    // Record cost-tracking event (snapshot of resources at start time)
    await recordContainerStart({
      tenantId,
      containerId: container.id,
      cpuShares: resourceLimits?.cpuShares,
      memoryBytes: resourceLimits?.memory,
      image,
      hostId,
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

    // Record cost-tracking event (with duration calculated at stop time)
    await recordContainerStop({
      tenantId,
      containerId,
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
    const { hostId, status } = request.query as { hostId?: string; status?: string };
    const { limit, offset } = parsePaginationParams(request.query as Record<string, unknown>);

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

    // Apply optional status filter (in-memory; dataset is tenant-scoped)
    if (status) {
      containers = containers.filter((c: any) => c.status === status.toUpperCase());
    }

    const total = containers.length;
    const paged = containers.slice(offset, offset + limit);

    return reply.status(200).send(
      buildPaginatedResponse(paged, limit, offset, total)
    );
  } catch (error) {
    (request.log as unknown as StructuredLogger).error({ err: error }, 'Error listing containers');
    return reply.status(500).send({ error: (error as Error).message || 'Failed to list containers' });
  }
}

export async function getContainerLogsHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const { tenantId } = request.user as any;
    const { id } = request.params as { id: string };
    const { tail, follow, timestamps } = request.query as {
      tail?: string;
      follow?: string;
      timestamps?: string;
    };

    if (!id) {
      return reply.status(400).send({ error: 'Container ID required' });
    }

    // Verify container belongs to tenant
    const container = await containerService.getContainer(tenantId, id);

    // Resolve agent connection info
    const registry = getAgentRegistry();
    const agent = await registry.getAgent(container.hostId);

    if (!agent) {
      // Fall back to stored logs from the database when agent is offline
      const storedLogs = await prisma.containerLog.findMany({
        where: { containerId: id, tenantId },
        orderBy: { timestamp: 'asc' },
        take: tail ? parseInt(tail, 10) : 100,
      });

      return reply.status(200).send({
        source: 'database',
        containerId: id,
        logs: storedLogs.map((log) => ({
          timestamp: log.timestamp,
          stream: log.stream,
          data: log.data.toString('utf8'),
        })),
      });
    }

    // Stream live logs from the agent via gRPC
    const agentClient = getGrpcAgentClient();
    const logStream = agentClient.getContainerLogs(container.hostId, agent.grpcAddress, {
      host_id: container.hostId,
      container_id: id,
      follow: follow === 'true',
      timestamps: timestamps === 'true',
      tail: tail ? parseInt(tail, 10) : 100,
    });

    // Set up newline-delimited JSON streaming response
    reply.raw.setHeader('Content-Type', 'application/x-ndjson');
    reply.raw.setHeader('Cache-Control', 'no-cache');

    for await (const entry of logStream) {
      const line = JSON.stringify({
        containerId: entry.container_id,
        timestamp: entry.timestamp,
        stream: entry.stream,
        data: Buffer.isBuffer(entry.data) ? entry.data.toString('utf8') : entry.data,
      });
      reply.raw.write(line + '\n');
    }

    reply.raw.end();
    return reply;
  } catch (error) {
    (request.log as unknown as StructuredLogger).error({ err: error }, 'Error getting container logs');

    if ((error as Error).message.includes('not found')) {
      return reply.status(404).send({ error: 'Container not found' });
    }

    if (!reply.sent) {
      return reply.status(500).send({ error: (error as Error).message || 'Failed to get container logs' });
    }
    return reply;
  }
}
