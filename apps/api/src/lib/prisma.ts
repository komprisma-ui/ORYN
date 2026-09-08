import { PrismaClient } from '@prisma/client';
import { initializeAutomationOrchestrator } from '../modules/automation/orchestrator.js';
import { emitEntityEvent } from './event-runtime.js';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
const basePrisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = basePrisma;

const eventModelMap: Record<string, 'customer.created' | 'customer.updated' | 'conversation.updated' | 'message.created' | 'lead.created' | 'lead.updated' | 'follow_up.created' | 'follow_up.updated'> = {
  Customer: 'customer.updated',
  Conversation: 'conversation.updated',
  Message: 'message.created',
  Lead: 'lead.updated',
  Task: 'follow_up.updated',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export const prisma = basePrisma.$extends({
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        const result: unknown = await query(args);
        if (!model || !isRecord(result)) return result;
        if (operation !== 'create' && operation !== 'update') return result;

        const entityId = typeof result.id === 'string' ? result.id : undefined;
        if (!entityId) return result;

        let organizationId = typeof result.organizationId === 'string' ? result.organizationId : undefined;
        if (!organizationId && model === 'Message' && typeof result.conversationId === 'string') {
          const conversation = await basePrisma.conversation.findUnique({
            where: { id: result.conversationId },
            select: { organizationId: true },
          });
          organizationId = conversation?.organizationId;
        }
        if (!organizationId) return result;

        const eventName = eventModelMap[model];
        if (!eventName) return result;
        const resolvedEventName = operation === 'create'
          ? (model === 'Customer' ? 'customer.created' : model === 'Lead' ? 'lead.created' : model === 'Task' ? 'follow_up.created' : eventName)
          : eventName;

        const changes: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(result)) {
          if (['id', 'organizationId', 'createdAt', 'updatedAt'].includes(key)) continue;
          if (['passwordHash', 'token', 'secret'].includes(key)) continue;
          if (value instanceof Date) changes[key] = value.toISOString();
          else if (['string', 'number', 'boolean'].includes(typeof value) || value === null) changes[key] = value;
        }

        emitEntityEvent(resolvedEventName, organizationId, model, entityId, changes);
        return result;
      },
    },
  },
});

initializeAutomationOrchestrator();
