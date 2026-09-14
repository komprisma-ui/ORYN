import { PrismaClient } from '@prisma/client';
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

function sanitizeChanges(row: Record<string, unknown>): Record<string, unknown> {
  const changes: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (['id', 'organizationId', 'createdAt', 'updatedAt'].includes(key)) continue;
    if (['passwordHash', 'token', 'secret'].includes(key)) continue;
    if (value instanceof Date) changes[key] = value.toISOString();
    else if (['string', 'number', 'boolean'].includes(typeof value) || value === null) changes[key] = value;
  }
  return changes;
}

async function findUniqueUpdatedEntity(model: string, id: string): Promise<Record<string, unknown> | null> {
  const delegates: Record<string, { findUnique: (args: { where: { id: string } }) => Promise<unknown> }> = {
    Customer: basePrisma.customer,
    Conversation: basePrisma.conversation,
    Lead: basePrisma.lead,
    Task: basePrisma.task,
  };
  const delegate = delegates[model];
  if (!delegate) return null;
  const row = await delegate.findUnique({ where: { id } });
  return isRecord(row) ? row : null;
}

export const prisma = basePrisma.$extends({
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        const result: unknown = await query(args);
        if (!model) return result;

        if (operation === 'updateMany') {
          if (!isRecord(result) || typeof result.count !== 'number' || result.count !== 1) return result;
          const rawArgs = isRecord(args) ? args : {};
          const where = isRecord(rawArgs.where) ? rawArgs.where : {};
          const entityId = typeof where.id === 'string' ? where.id : undefined;
          if (!entityId) return result;
          const row = await findUniqueUpdatedEntity(model, entityId);
          if (!row) return result;
          const organizationId = typeof row.organizationId === 'string' ? row.organizationId : undefined;
          const eventName = eventModelMap[model];
          if (!organizationId || !eventName) return result;
          emitEntityEvent(eventName, organizationId, model, entityId, sanitizeChanges(row));
          return result;
        }

        if (!isRecord(result) || (operation !== 'create' && operation !== 'update')) return result;
        const entityId = typeof result.id === 'string' ? result.id : undefined;
        if (!entityId) return result;
        let organizationId = typeof result.organizationId === 'string' ? result.organizationId : undefined;
        if (!organizationId && model === 'Message' && typeof result.conversationId === 'string') {
          const conversation = await basePrisma.conversation.findUnique({ where: { id: result.conversationId }, select: { organizationId: true } });
          organizationId = conversation?.organizationId;
        }
        if (!organizationId) return result;
        const eventName = eventModelMap[model];
        if (!eventName) return result;
        const resolvedEventName = operation === 'create'
          ? (model === 'Customer' ? 'customer.created' : model === 'Lead' ? 'lead.created' : model === 'Task' ? 'follow_up.created' : eventName)
          : eventName;
        emitEntityEvent(resolvedEventName, organizationId, model, entityId, sanitizeChanges(result));
        return result;
      },
    },
  },
});
