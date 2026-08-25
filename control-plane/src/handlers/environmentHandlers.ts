import { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { EnvironmentType } from '@prisma/client';
import { environmentService, EnvironmentAlreadyExistsError, EnvironmentNotFoundError } from '../services/environmentService';

const createSchema = z.object({ name: z.string().min(2), slug: z.string().min(2).regex(/^[a-z0-9-]+$/), type: z.nativeEnum(EnvironmentType) });
const idParamsSchema = z.object({ id: z.string().uuid() });

export async function listEnvironmentsHandler(request: FastifyRequest, reply: FastifyReply) {
  const environments = await environmentService.list(request.auth!.tenantId);
  return reply.send({ data: environments });
}

export async function getEnvironmentHandler(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  const { id } = idParamsSchema.parse(request.params);
  try { return reply.send({ data: await environmentService.get(request.auth!.tenantId, id) }); }
  catch (error) { if (error instanceof EnvironmentNotFoundError) return reply.code(404).send({ error: error.message }); throw error; }
}

export async function createEnvironmentHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = createSchema.parse(request.body);
  try { return reply.code(201).send({ data: await environmentService.create(request.auth!.tenantId, body) }); }
  catch (error) { if (error instanceof EnvironmentAlreadyExistsError) return reply.code(409).send({ error: error.message }); throw error; }
}
