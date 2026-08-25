import { FastifyRequest, FastifyReply } from 'fastify';
import { createContainerService } from '../services/containerService';
import { PrismaClient } from '@prisma/client';

const containerService = createContainerService();
const prisma = new PrismaClient();

export async function startContainerHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const { tenantId } = request.user as any;
    
    if (!request.body) {
      return reply.status(400).send({ error: 'Request body required' });
    }

    const { name, image, hostId, environmentVars, resourceLimits, portBindings } = request.body as any;

    if (!name || !image || !hostId) {
      return reply.status(400).send({ error: 'Missing required fields: name, image, hostId' });
    }

    const container = await containerService.startContainer(tenantId, {
      name,
      image,
      hostId,
      environmentVars: environmentVars || {},
      resourceLimits: resourceLimits || {},
      portBindings: portBindings || {},
    });

    return reply.status(201).send(container);
  } catch (error) {
    console.error('Error starting container:', error);
    return reply.status(500).send({ error: (error as Error).message || 'Failed to start container' });
  }
}

export async function stopContainerHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const { tenantId } = request.user as any;
    
    if (!request.body) {
      return reply.status(400).send({ error: 'Request body required' });
    }

    const { containerId, timeoutSeconds } = request.body as any;

    if (!containerId) {
      return reply.status(400).send({ error: 'Missing required field: containerId' });
    }

    const container = await containerService.stopContainer(tenantId, {
      containerId,
      timeoutSeconds: timeoutSeconds || 15,
    });

    return reply.status(200).send(container);
  } catch (error) {
    console.error('Error stopping container:', error);
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
    console.error('Error getting container:', error);
    
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
    console.error('Error listing containers:', error);
    return reply.status(500).send({ error: (error as Error).message || 'Failed to list containers' });
  }
}
