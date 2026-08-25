import { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { listTenantsHandler, getTenantHandler, createTenantHandler } from '../handlers/tenantHandlers';
import { listEnvironmentsHandler, getEnvironmentHandler, createEnvironmentHandler } from '../handlers/environmentHandlers';
import { listHostsHandler, getHostHandler, registerHostHandler } from '../handlers/hostHandlers';
import { UserRole } from '@prisma/client';

export async function setupRoutes(app: FastifyInstance) {
  app.get('/api/health', async () => ({ status: 'ok' }));

  app.post<{ Body: { name: string; slug: string } }>('/api/tenants', { onRequest: authenticate, preHandler: requireRole(UserRole.ADMIN) }, createTenantHandler);
  app.get('/api/tenants', { onRequest: authenticate }, listTenantsHandler);
  app.get<{ Params: { id: string } }>('/api/tenants/:id', { onRequest: authenticate }, getTenantHandler);

  app.get('/api/environments', { onRequest: authenticate }, listEnvironmentsHandler);
  app.get<{ Params: { id: string } }>('/api/environments/:id', { onRequest: authenticate }, getEnvironmentHandler);
  app.post<{ Body: { name: string; slug: string; type: string } }>('/api/environments', { onRequest: authenticate, preHandler: requireRole(UserRole.ADMIN, UserRole.OPERATOR) }, createEnvironmentHandler);

  app.get('/api/hosts', { onRequest: authenticate }, listHostsHandler);
  app.get<{ Params: { id: string } }>('/api/hosts/:id', { onRequest: authenticate }, getHostHandler);
  app.post<{ Body: { name: string; hostname: string; agentId?: string; metadata?: object } }>('/api/hosts', { onRequest: authenticate, preHandler: requireRole(UserRole.ADMIN, UserRole.OPERATOR) }, registerHostHandler);
}
