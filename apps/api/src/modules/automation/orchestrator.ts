import { Prisma } from '@prisma/client';
import { subscribeEvent, type OrynEvent } from '../../lib/event-bus.js';
import { prisma } from '../../lib/prisma.js';

export type AutomationActionStatus = 'PENDING' | 'ACKNOWLEDGED';
export type AutomationActionType = 'AI_INSIGHT' | 'FOLLOW_UP_SUGGESTION' | 'INBOX_ALERT';

export type AutomationAction = {
  id: string;
  organizationId: string;
  eventId: string;
  type: AutomationActionType;
  reason: string;
  status: AutomationActionStatus;
  createdAt: string;
  acknowledgedAt?: string;
  acknowledgedBy?: string;
};

let initialized = false;

function enqueue(event: OrynEvent, type: AutomationActionType, reason: string): void {
  void prisma.automationAction.create({
    data: { organizationId: event.organizationId, eventId: event.id, type, reason },
  }).catch(error => {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return;
    console.error('[ORYN automation] failed to persist action', error);
  });
}

function toAction(row: { id: string; organizationId: string; eventId: string; type: AutomationActionType; reason: string; status: AutomationActionStatus; createdAt: Date; acknowledgedAt: Date | null; acknowledgedBy: string | null }): AutomationAction {
  return {
    id: row.id,
    organizationId: row.organizationId,
    eventId: row.eventId,
    type: row.type,
    reason: row.reason,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    ...(row.acknowledgedAt ? { acknowledgedAt: row.acknowledgedAt.toISOString() } : {}),
    ...(row.acknowledgedBy ? { acknowledgedBy: row.acknowledgedBy } : {}),
  };
}

export function initializeAutomationOrchestrator(): void {
  if (initialized) return;
  initialized = true;
  subscribeEvent('message.created', event => enqueue(event, 'INBOX_ALERT', 'New conversation activity requires routing or response evaluation.'));
  subscribeEvent('lead.created', event => enqueue(event, 'FOLLOW_UP_SUGGESTION', 'New lead should be evaluated for next-best follow-up.'));
  subscribeEvent('lead.updated', event => enqueue(event, 'AI_INSIGHT', 'Lead changed stage or value; refresh sales insight.'));
  subscribeEvent('customer.updated', event => enqueue(event, 'AI_INSIGHT', 'Customer profile changed; refresh customer intelligence.'));
  subscribeEvent('follow_up.created', event => enqueue(event, 'FOLLOW_UP_SUGGESTION', 'Follow-up created; evaluate timing and priority.'));
}

export async function getPendingAutomationActions(organizationId: string, limit = 50): Promise<AutomationAction[]> {
  const safeLimit = Math.max(1, Math.min(limit, 100));
  const rows = await prisma.automationAction.findMany({ where: { organizationId, status: 'PENDING' }, orderBy: { createdAt: 'desc' }, take: safeLimit });
  return rows.map(toAction);
}

export async function getAutomationStatus(organizationId: string): Promise<{ pending: number; acknowledged: number; total: number; initialized: boolean }> {
  const [pending, acknowledged, total] = await Promise.all([
    prisma.automationAction.count({ where: { organizationId, status: 'PENDING' } }),
    prisma.automationAction.count({ where: { organizationId, status: 'ACKNOWLEDGED' } }),
    prisma.automationAction.count({ where: { organizationId } }),
  ]);
  return { pending, acknowledged, total, initialized };
}

export async function acknowledgeAutomationAction(organizationId: string, actionId: string, acknowledgedBy: string): Promise<AutomationAction | null> {
  const result = await prisma.automationAction.updateMany({ where: { id: actionId, organizationId, status: 'PENDING' }, data: { status: 'ACKNOWLEDGED', acknowledgedAt: new Date(), acknowledgedBy } });
  if (result.count === 0) {
    const existing = await prisma.automationAction.findFirst({ where: { id: actionId, organizationId } });
    return existing ? toAction(existing) : null;
  }
  const updated = await prisma.automationAction.findFirst({ where: { id: actionId, organizationId } });
  return updated ? toAction(updated) : null;
}

export function clearAutomationActions(): void {
  // Persistence is intentional: actions survive API restarts. Database cleanup is explicit.
}
