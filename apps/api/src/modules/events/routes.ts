import type { FastifyInstance } from 'fastify';
import { PassThrough } from 'node:stream';
import { tenantContext } from '../../lib/auth.js';
import { getRecentEvents } from '../../lib/event-journal.js';
import { realtimeClientCount } from '../../lib/realtime.js';
import { attachEventStream } from '../../lib/realtime-runtime.js';
import { registerAutomationRoutes } from '../automation/routes.js';

export async function registerEventRoutes(app: FastifyInstance): Promise<void> {
  await registerAutomationRoutes(app);

  app.get('/api/v1/events', async request => {
    const { organizationId } = tenantContext(request);
    const raw = (request.query as { limit?: string }).limit;
    const limit = raw === undefined ? 100 : Number(raw);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      return { error: 'INVALID_LIMIT' };
    }
    return { data: getRecentEvents(organizationId, limit) };
  });

  app.get('/api/v1/events/status', async request => {
    const { organizationId } = tenantContext(request);
    return { data: { realtimeClients: realtimeClientCount(organizationId), journal: 'memory', maxEvents: 500 } };
  });

  app.get('/api/v1/events/stream', async (request, reply) => {
    const { organizationId } = tenantContext(request);
    const lastEventId = request.headers['last-event-id'];
    const stream = new PassThrough();
    let detach: (() => void) | undefined;
    let heartbeat: NodeJS.Timeout | undefined;

    reply.hijack();
    reply.raw.statusCode = 200;
    reply.raw.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    reply.raw.setHeader('Cache-Control', 'no-cache, no-transform');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.raw.setHeader('X-Accel-Buffering', 'no');
    stream.pipe(reply.raw);

    detach = attachEventStream(
      organizationId,
      {
        write: chunk => stream.write(chunk),
        end: () => stream.end(),
      },
      typeof lastEventId === 'string' ? lastEventId : undefined,
    );
    heartbeat = setInterval(() => stream.write(': heartbeat\n\n'), 15000);

    const cleanup = () => {
      if (heartbeat) clearInterval(heartbeat);
      detach?.();
      detach = undefined;
    };
    request.raw.once('close', cleanup);
    stream.once('close', cleanup);
    return reply;
  });
}
