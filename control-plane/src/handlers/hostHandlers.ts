import { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { hostService, HostNotFoundError } from '../services/hostService';

const createSchema = z.object({ name: z.string().min(2), hostname: z.string().min(1), agentId: z.string().min(1).optional(), metadata: z.record(z.unknown()).optional() });
const idParamsSchema = z.object({ id: z.string().uuid() });

export async function listHostsHandler(request: FastifyRequest, reply: FastifyReply) {
  return reply.send({ data: await hostService.list(request.auth!.tenantId) });
}

export async function getHostHandler(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  const { id } = idParamsSchema.parse(request.params);
  try { return reply.send({ data: await hostService.get(request.auth!.tenantId, id) }); }
  catch (error) { if (error instanceof HostNotFoundError) return reply.code(404).send({ error: error.message }); throw error; }
}

export async function registerHostHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = createSchema.parse(request.body);
  return reply.code(201).send({ data: await hostService.register(request.auth!.tenantId, body) });
}
