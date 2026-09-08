import type { FastifyInstance } from 'fastify';
import { tenantContext } from '../../lib/auth.js';
import { getRecentEvents } from '../../lib/event-journal.js';
import { realtimeClientCount } from '../../lib/realtime.js';

export async function registerEventRoutes(app: FastifyInstance): Promise<void> {
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
}
