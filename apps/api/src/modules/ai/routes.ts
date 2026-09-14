import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { tenantContext } from '../../lib/auth.js';
import { runAi } from './engine.js';

const requestSchema = z.object({
  agent: z.enum(['customer','reply','sales','follow_up','summary','classification','insight']),
  input: z.string().trim().min(1).max(12000),
  context: z.record(z.string(), z.unknown()).optional(),
});

export async function registerAiRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/v1/ai/run', async (request, reply) => {
    const { organizationId } = tenantContext(request);
    const body = requestSchema.parse(request.body);
    const result = runAi(body);
    return reply.send({ data: { ...result, organizationId } });
  });
}
