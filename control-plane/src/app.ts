import Fastify from 'fastify';
import cors from '@fastify/cors';
import { env } from './config/env';

export async function buildApp() {
  const app = Fastify({ logger: true });
  await app.register(cors);

  app.get('/health', async () => ({ status: 'ok' }));

  return app;
}

if (require.main === module) {
  buildApp()
    .then((app) => app.listen({ host: env.HOST, port: env.PORT }))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
