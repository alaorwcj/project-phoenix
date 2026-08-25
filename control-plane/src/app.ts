import Fastify from 'fastify';
import cors from '@fastify/cors';
import { env } from './config/env';
import { setupRoutes } from './routes/api';

export async function buildApp() {
  const app = Fastify({ logger: { level: env.LOG_LEVEL || 'info' } });
  
  await app.register(cors, { origin: true });
  
  await setupRoutes(app);

  app.setErrorHandler(async (error, request, reply) => {
    if (error instanceof SyntaxError && 'status' in error && error.status === 400) {
      return reply.code(400).send({ error: 'Invalid request body' });
    }
    app.log.error(error);
    return reply.code(500).send({ error: 'Internal server error' });
  });

  return app;
}

if (require.main === module) {
  buildApp()
    .then((app) => app.listen({ host: env.HOST, port: env.PORT }, (err, address) => {
      if (err) { console.error(err); process.exit(1); }
      console.log('Control Plane listening at', address);
    }))
    .catch((error) => { console.error(error); process.exit(1); });
}