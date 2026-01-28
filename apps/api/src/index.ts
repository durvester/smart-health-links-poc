import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import { config } from './config.js';
import { registerSmartRoutes } from './routes/smart.js';
import { registerSessionRoutes } from './routes/session.js';
import { registerShlRoutes } from './routes/shl.js';
import { registerManifestRoutes } from './routes/manifest.js';

async function main() {
  const fastify = Fastify({
    logger: {
      level: config.NODE_ENV === 'development' ? 'debug' : 'info',
      transport:
        config.NODE_ENV === 'development'
          ? {
              target: 'pino-pretty',
              options: {
                translateTime: 'HH:MM:ss Z',
                ignore: 'pid,hostname',
              },
            }
          : undefined,
    },
  });

  // Register plugins
  // CORS: Allow any origin for SHL interoperability
  // - Manifest endpoint is public per SHL spec (security via URL entropy + encryption)
  // - Authenticated endpoints use httpOnly session cookies (domain-locked to api.myhealthurl.com)
  await fastify.register(cors, {
    origin: true,
    credentials: true,
  });

  await fastify.register(cookie, {
    secret: config.SESSION_SECRET,
    parseOptions: {},
  });

  // Health check endpoint
  fastify.get('/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  // Register route modules
  await registerSmartRoutes(fastify);
  await registerSessionRoutes(fastify);
  await registerShlRoutes(fastify);
  await registerManifestRoutes(fastify);

  // Start server
  try {
    await fastify.listen({ port: config.PORT, host: '0.0.0.0' });
    console.log(`
╔════════════════════════════════════════════════════════════╗
║                    MyHealthURL API                          ║
╠════════════════════════════════════════════════════════════╣
║  Server running on: http://localhost:${config.PORT}                  ║
║  Environment: ${config.NODE_ENV.padEnd(43)}║
╚════════════════════════════════════════════════════════════╝
    `);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

main();
