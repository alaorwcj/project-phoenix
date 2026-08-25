import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createContainerService, StartContainerInput, StopContainerInput } from '../services/containerService';
import { authMiddleware, requireRole } from '../middleware/auth';

export async function containerRoutes(app: FastifyInstance) {
  const containerService = createContainerService();

  // Start container
  app.post<{ Body: StartContainerInput }>(
    '/api/containers/start',
    { preHandler: [authMiddleware, requireRole('OPERATOR')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const tenantId = (request as any).user.tenantId;
        const result = await containerService.startContainer(tenantId, request.body);
        reply.code(201).send({
          success: true,
          data: result,
        });
      } catch (error) {
        reply.code(400).send({
          success: false,
          error: (error as Error).message,
        });
      }
    }
  );

  // Stop container
  app.post<{ Body: StopContainerInput }>(
    '/api/containers/stop',
    { preHandler: [authMiddleware, requireRole('OPERATOR')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const tenantId = (request as any).user.tenantId;
        const result = await containerService.stopContainer(tenantId, request.body);
        reply.code(200).send({
          success: true,
          data: result,
        });
      } catch (error) {
        reply.code(400).send({
          success: false,
          error: (error as Error).message,
        });
      }
    }
  );

  // Get container details
  app.get<{ Params: { id: string } }>(
    '/api/containers/:id',
    { preHandler: [authMiddleware, requireRole('VIEWER')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const tenantId = (request as any).user.tenantId;
        const { id } = request.params;
        const container = await containerService.getContainer(tenantId, id);
        reply.code(200).send({
          success: true,
          data: container,
        });
      } catch (error) {
        reply.code(404).send({
          success: false,
          error: (error as Error).message,
        });
      }
    }
  );

  // List containers (with optional host filter)
  app.get<{ Querystring: { hostId?: string } }>(
    '/api/containers',
    { preHandler: [authMiddleware, requireRole('VIEWER')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const tenantId = (request as any).user.tenantId;
        const { hostId } = request.query;
        const containers = await containerService.listContainers(tenantId, hostId);
        reply.code(200).send({
          success: true,
          data: containers,
          count: containers.length,
        });
      } catch (error) {
        reply.code(400).send({
          success: false,
          error: (error as Error).message,
        });
      }
    }
  );
}
