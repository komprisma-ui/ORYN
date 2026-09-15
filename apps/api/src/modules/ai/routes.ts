import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { tenantContext } from '../../lib/auth.js';
import { writeAudit } from '../../lib/audit.js';
import { runAi, runAiOrchestrator } from './engine.js';

const requestSchema = z.object({
  agent: z.enum(['customer','reply','sales','follow_up','summary','classification','insight','orchestrator']),
  input: z.string().trim().min(1).max(12000),
  context: z.record(z.string(), z.unknown()).optional(),
});

export async function registerAiRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/v1/ai/run', async (request, reply) => {
    const { organizationId, user } = tenantContext(request);
    const body = requestSchema.parse(request.body);
    const result = body.agent === 'orchestrator'
      ? runAiOrchestrator(body.input, body.context)
      : runAi({ agent: body.agent, input: body.input, context: body.context });

    void writeAudit({
      organizationId,
      actorId: user.id,
      action: 'AI_EXECUTION',
      entityType: 'AI',
      metadata: {
        agent: body.agent,
        provider: result.provider,
        confidence: result.confidence,
      },
    });

    return reply.send({ data: { ...result, organizationId } });
  });
}
