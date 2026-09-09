import { subscribeEvent, type OrynEvent } from '../../lib/event-bus.js';

export type AutomationActionStatus = 'PENDING' | 'ACKNOWLEDGED';

export type AutomationAction = {
  id: string;
  organizationId: string;
  eventId: string;
  type: 'AI_INSIGHT' | 'FOLLOW_UP_SUGGESTION' | 'INBOX_ALERT';
  reason: string;
  status: AutomationActionStatus;
  createdAt: string;
  acknowledgedAt?: string;
  acknowledgedBy?: string;
};

const actions: AutomationAction[] = [];
let initialized = false;

function enqueue(event: OrynEvent, type: AutomationAction['type'], reason: string): void {
  actions.push({
    id: crypto.randomUUID(),
    organizationId: event.organizationId,
    eventId: event.id,
    type,
    reason,
    status: 'PENDING',
    createdAt: new Date().toISOString(),
  });
  if (actions.length > 1000) actions.splice(0, actions.length - 1000);
}

export function initializeAutomationOrchestrator(): void {
  if (initialized) return;
  initialized = true;

  subscribeEvent('message.created', event => {
    enqueue(event, 'INBOX_ALERT', 'New conversation activity requires routing or response evaluation.');
  });
  subscribeEvent('lead.created', event => {
    enqueue(event, 'FOLLOW_UP_SUGGESTION', 'New lead should be evaluated for next-best follow-up.');
  });
  subscribeEvent('lead.updated', event => {
    enqueue(event, 'AI_INSIGHT', 'Lead changed stage or value; refresh sales insight.');
  });
  subscribeEvent('customer.updated', event => {
    enqueue(event, 'AI_INSIGHT', 'Customer profile changed; refresh customer intelligence.');
  });
  subscribeEvent('follow_up.created', event => {
    enqueue(event, 'FOLLOW_UP_SUGGESTION', 'Follow-up created; evaluate timing and priority.');
  });
}

export function getPendingAutomationActions(organizationId: string, limit = 50): AutomationAction[] {
  const safeLimit = Math.max(1, Math.min(limit, 100));
  return actions
    .filter(action => action.organizationId === organizationId && action.status === 'PENDING')
    .slice(-safeLimit)
    .reverse();
}

export function getAutomationStatus(organizationId: string): {
  pending: number;
  acknowledged: number;
  total: number;
  initialized: boolean;
} {
  const tenantActions = actions.filter(action => action.organizationId === organizationId);
  return {
    pending: tenantActions.filter(action => action.status === 'PENDING').length,
    acknowledged: tenantActions.filter(action => action.status === 'ACKNOWLEDGED').length,
    total: tenantActions.length,
    initialized,
  };
}

export function acknowledgeAutomationAction(organizationId: string, actionId: string, acknowledgedBy: string): AutomationAction | null {
  const action = actions.find(item => item.id === actionId && item.organizationId === organizationId);
  if (!action) return null;
  if (action.status === 'ACKNOWLEDGED') return action;
  action.status = 'ACKNOWLEDGED';
  action.acknowledgedAt = new Date().toISOString();
  action.acknowledgedBy = acknowledgedBy;
  return action;
}

export function clearAutomationActions(): void {
  actions.length = 0;
}
