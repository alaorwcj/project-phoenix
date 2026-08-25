import { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { tenantRepository } from '../repositories/tenantRepository';

const createSchema = z.object({ name: z.string().min(2), slug: z.string().min(2).regex(/^[a-z0-9-]+$/) });

export async function listTenantsHandler(request: FastifyRequest, reply: FastifyReply) {
  return reply.send({ data: await tenantRepository.list() });
}

export async function getTenantHandler(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
  const tenant = await tenantRepository.findById(id);
  if (!tenant) return reply.code(404).send({ error: 'Tenant not found' });
  return reply.send({ data: tenant });
}

export async function createTenantHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = createSchema.parse(request.body);
  return reply.code(201).send({ data: await tenantRepository.create(body) });
}
