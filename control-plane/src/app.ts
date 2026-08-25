import Fastify from 'fastify';
import cors from '@fastify/cors';
import { env } from './config/env';
import { setupRoutes } from './routes/api';
import { GrpcServer } from './lib/grpcServer';

let grpcServer: GrpcServer;

export async function buildApp() {
  const app = Fastify({ logger: { level: env.LOG_LEVEL || 'info' } });
  
  await app.register(cors, { origin: true });
  
  await setupRoutes(app);

  grpcServer = new GrpcServer(env.GRPC_PORT);
  
  app.setErrorHandler(async (error, request, reply) => {
    if (error instanceof SyntaxError && 'status' in error && error.status === 400) {
      return reply.code(400).send({ error: 'Invalid request body' });
    }
    app.log.error(error);
    return reply.code(500).send({ error: 'Internal server error' });
  });

  app.addHook('onClose', async () => {
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