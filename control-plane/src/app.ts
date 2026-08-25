import Fastify from 'fastify';
import cors from '@fastify/cors';
import { env } from './config/env';
import { setupRoutes } from './routes/api';
import { setupJobRoutes } from './routes/jobs';
import { GrpcServer } from './lib/grpcServer';
import { initializeJobQueue, getJobQueue } from './lib/jobQueue';
import { registerJobHandlers } from './lib/jobHandlers';

let grpcServer: GrpcServer;

export async function buildApp() {
  const app = Fastify({ logger: { level: env.LOG_LEVEL || 'info' } });
  
  await app.register(cors, { origin: true });
  
  // Initialize job queue
  await initializeJobQueue();
  await registerJobHandlers();

  await setupRoutes(app);
  await setupJobRoutes(app);

  grpcServer = new GrpcServer(env.GRPC_PORT);
  
  app.setErrorHandler(async (error, request, reply) => {
    if (error instanceof SyntaxError && 'status' in error && error.status === 400) {
      return reply.code(400).send({ error: 'Invalid request body' });
    }
    app.log.error(error);
    return reply.code(500).send({ error: 'Internal server error' });
  });

  app.addHook('onClose', async () => {
    const jobQueue = getJobQueue();
    await jobQueue.closeQueues();
    await grpcServer.stop();
  });

  return app;
}

if (require.main === module) {
  buildApp()
    .then(async (app) => {
      await grpcServer.start();
      await app.listen({ host: env.HOST, port: env.PORT }, (err, address) => {
        if (err) { console.error(err); process.exit(1); }
        console.log('Control Plane REST API listening at', address);
      });
    })
    .catch((error) => { console.error(error); process.exit(1); });
}