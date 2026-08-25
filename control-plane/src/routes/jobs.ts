import { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import {
  getJobStatusHandler,
  listJobsHandler,
  retryJobHandler,
  cancelJobHandler,
} from '../handlers/jobHandlers';
import { UserRole } from '@prisma/client';

export async function setupJobRoutes(app: FastifyInstance) {
  // Get job status
  app.get<{ Params: { jobType: string; jobId: string } }>(
    '/api/jobs/:jobType/:jobId',
    { onRequest: authenticate, preHandler: requireRole(UserRole.VIEWER) },
    getJobStatusHandler
  );

  // List jobs by type
  app.get(
    '/api/jobs',
    { onRequest: authenticate, preHandler: requireRole(UserRole.VIEWER) },
    listJobsHandler
  );

  // Retry a failed job
  app.post<{ Params: { jobType: string; jobId: string } }>(
    '/api/jobs/:jobType/:jobId/retry',
    { onRequest: authenticate, preHandler: requireRole(UserRole.OPERATOR) },
    retryJobHandler
  );

  // Cancel a pending job
  app.delete<{ Params: { jobType: string; jobId: string } }>(
    '/api/jobs/:jobType/:jobId',
    { onRequest: authenticate, preHandler: requireRole(UserRole.OPERATOR) },
    cancelJobHandler
  );
}
