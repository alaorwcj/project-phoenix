import { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { listTenantsHandler, getTenantHandler, createTenantHandler } from '../handlers/tenantHandlers';
import { listEnvironmentsHandler, getEnvironmentHandler, createEnvironmentHandler } from '../handlers/environmentHandlers';
import { listHostsHandler, getHostHandler, registerHostHandler } from '../handlers/hostHandlers';
import { startContainerHandler, stopContainerHandler, getContainerHandler, listContainersHandler } from '../handlers/containerHandlers';
import { evaluateHostHealth, planFailover, findMigrationTargets } from '../lib/hostHealth';
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

  app.post('/api/containers/start', { onRequest: authenticate, preHandler: requireRole(UserRole.OPERATOR) }, startContainerHandler);
  app.post('/api/containers/stop', { onRequest: authenticate, preHandler: requireRole(UserRole.OPERATOR) }, stopContainerHandler);
  app.get<{ Params: { id: string } }>('/api/containers/:id', { onRequest: authenticate, preHandler: requireRole(UserRole.VIEWER) }, getContainerHandler);
  app.get('/api/containers', { onRequest: authenticate, preHandler: requireRole(UserRole.VIEWER) }, listContainersHandler);

  // Host-health operations (admin only — operators must not silently fail hosts over)
  app.post<{ Body: { staleAfterMs?: number } }>(
    '/api/hosts/health/sweep',
    { onRequest: authenticate, preHandler: requireRole(UserRole.ADMIN) },
    async (request) => {
      const { staleAfterMs } = (request.body || {}) as { staleAfterMs?: number };
      return evaluateHostHealth(staleAfterMs ?? 60_000);
    }
  );
  app.get<{ Params: { id: string } }>(
    '/api/hosts/:id/failover-plan',
    { onRequest: authenticate, preHandler: requireRole(UserRole.ADMIN) },
    async (request) => {
      const tenantId = (request.user as any).tenantId;
      return planFailover(tenantId, request.params.id);
    }
  );
  app.get<{
    Params: { id: string };
    Querystring: { cpuShares?: string; memory?: string };
  }>(
    '/api/hosts/:id/migration-targets',
    { onRequest: authenticate, preHandler: requireRole(UserRole.ADMIN) },
    async (request) => {
      const tenantId = (request.user as any).tenantId;
      const cpuShares = request.query.cpuShares ? Number(request.query.cpuShares) : 0;
      const memory = request.query.memory ? Number(request.query.memory) : 0;
      return findMigrationTargets(tenantId, request.params.id, { cpuShares, memory });
    }
  );
}
