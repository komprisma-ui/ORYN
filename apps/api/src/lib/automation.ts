import type { OrynEvent } from './event-bus.js';
import { subscribeEvent } from './event-bus.js';

export type AutomationRule = {
  id: string;
  organizationId: string;
  event: OrynEvent['name'];
  enabled: boolean;
  handler: (event: OrynEvent) => void | Promise<void>;
};

const rules = new Map<string, AutomationRule>();

export function registerAutomationRule(rule: AutomationRule): () => void {
  rules.set(rule.id, rule);
  const unsubscribe = subscribeEvent(rule.event, async event => {
    if (!rule.enabled || rule.organizationId !== event.organizationId) return;
    await rule.handler(event);
  });
  return () => {
    unsubscribe();
    rules.delete(rule.id);
  };
}

export function listAutomationRules(organizationId: string): Array<Omit<AutomationRule, 'handler'>> {
  return [...rules.values()]
    .filter(rule => rule.organizationId === organizationId)
    .map(({ handler: _handler, ...rule }) => rule);
}
