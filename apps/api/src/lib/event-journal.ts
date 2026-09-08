import type { OrynEvent } from './event-bus.js';

const MAX_EVENTS = 500;
const journal: OrynEvent[] = [];

export function recordEvent(event: OrynEvent): void {
  journal.push(event);
  if (journal.length > MAX_EVENTS) journal.splice(0, journal.length - MAX_EVENTS);
}

export function getRecentEvents(organizationId: string, limit = 100): OrynEvent[] {
  const safeLimit = Math.max(1, Math.min(limit, 100));
  return journal.filter(event => event.organizationId === organizationId).slice(-safeLimit).reverse();
}

export function clearEventJournal(): void {
  journal.length = 0;
}
