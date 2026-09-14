import type { FastifyInstance } from 'fastify';
import { tenantContext } from '../../lib/auth.js';
import {
  acknowledgeAutomationAction,
  getAutomationStatus,
  getPendingAutomationActions,
} from './orchestrator.js';

function parseLimit(raw: unknown): number | null {
  if (raw === undefined) return 50;
  const value = Number(raw);
  return Number.isInteger(value) && value >= 1 && value <= 100 ? value : null;
}

export async function registerAutomationRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/automation/actions', async (request, reply) => {
    const { organizationId } = tenantContext(request);
    const limit = parseLimit((request.query as { limit?: string }).limit);
    if (limit === null) return reply.code(400).send({ error: 'INVALID_LIMIT' });
    return { data: await getPendingAutomationActions(organizationId, limit) };
  });

  app.get('/api/v1/automation/status', async request => {
    const { organizationId } = tenantContext(request);
    return { data: await getAutomationStatus(organizationId) };
  });

  app.post('/api/v1/automation/actions/:id/ack', async (request, reply) => {
    const { organizationId, user } = tenantContext(request);
    const actionId = (request.params as { id?: string }).id;
    if (!actionId) return reply.code(400).send({ error: 'INVALID_ACTION_ID' });
    const action = await acknowledgeAutomationAction(organizationId, actionId, user?.id ?? 'system');
    if (!action) return reply.code(404).send({ error: 'ACTION_NOT_FOUND' });
    return { data: action };
  });
}
