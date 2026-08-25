import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { env } from './config/env';
import { setupRoutes } from './routes/api';
import { setupJobRoutes } from './routes/jobs';
import { GrpcServer } from './lib/grpcServer';
import { initializeJobQueue, closeJobQueue } from './lib/jobQueue';
import { registerJobHandlers } from './lib/jobHandlers';
import { getLogger, setAppLogger, type StructuredLogger } from './lib/logger';
import { getMetricsText, metricsContentType, observeHttpRequest } from './lib/metrics';
import {
  resolveTraceContext,
  setRequestTraceId,
  resolveRequestId,
} from './lib/trace';

let appInstance: FastifyInstance | undefined;
let grpcServer: GrpcServer | undefined;
const requestStarts = new WeakMap<object, bigint>();

export async function buildApp() {
  const app = Fastify({
    logger: { level: env.LOG_LEVEL || 'info' },
    genReqId: resolveRequestId,
  });

  setAppLogger(app.log as unknown as StructuredLogger);

  await app.register(cors, { origin: true });

  app.get('/metrics', async (_request, reply) => {
    reply.type(metricsContentType);
    return getMetricsText();
  });

  app.addHook('onRequest', async (request, reply) => {
    requestStarts.set(request as unknown as object, process.hrtime.bigint());
    const traceContext = resolveTraceContext(request.headers as Record<string, unknown>);
    setRequestTraceId(request as unknown as object, traceContext.traceId);
    (request as any).log = request.log.child({
      requestId: request.id,
      traceId: traceContext.traceId,
    });
    reply.header('x-request-id', request.id);
    reply.header('x-correlation-id', request.id);
    reply.header('x-trace-id', traceContext.traceId);
  });

  app.addHook('onResponse', async (request, reply) => {
    const startedAt = requestStarts.get(request as unknown as object);
    if (!startedAt) return;

    const durationSeconds = Number(process.hrtime.bigint() - startedAt) / 1e9;
    const route = request.routeOptions?.url ?? 'unknown';
    observeHttpRequest(route, reply.statusCode, durationSeconds);
    requestStarts.delete(request as unknown as object);
  });

  await initializeJobQueue();
  await registerJobHandlers();

  await setupRoutes(app);
  await setupJobRoutes(app);

  grpcServer = new GrpcServer(env.GRPC_PORT);

  app.setErrorHandler(async (error, request, reply) => {
    const log = request.log as unknown as StructuredLogger;
    if (error instanceof SyntaxError && 'status' in error && error.status === 400) {
      return reply.code(400).send({ error: 'Invalid request body' });
    }
    log.error({ err: error }, 'Request failed');
    return reply.code(500).send({ error: 'Internal server error' });
  });

  app.addHook('onClose', async () => {
    await closeJobQueue();
    await grpcServer?.stop();
  });

  return app;
}

export async function start() {
  if (!appInstance) {
    appInstance = await buildApp();
    try {
      await grpcServer?.start();
    } catch (error) {
      appInstance = undefined;
      grpcServer = undefined;
      throw error;
    }
  }

  return appInstance;
}

export async function stop() {
  if (appInstance) {
    await appInstance.close();
    appInstance = undefined;
    grpcServer = undefined;
  }
}

export function getApp() {
  return appInstance;
}

if (require.main === module) {
  start()
    .then(async (app) => {
      const log = app.log as unknown as StructuredLogger;
      await app.listen({ host: env.HOST, port: env.PORT }, (err, address) => {
        if (err) {
          log.error({ err }, 'Failed to start Control Plane REST API');
          process.exit(1);
        }
        log.info({ address }, 'Control Plane REST API listening');
      });
    })
    .catch((error) => {
      getLogger({ component: 'control-plane' }).error({ err: error }, 'Control Plane bootstrap failed');
      process.exit(1);
    });
}