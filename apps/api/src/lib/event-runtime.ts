import { publishEvent, type OrynEvent } from './event-bus.js';

export function emitEvent(
  name: OrynEvent['name'],
  organizationId: string,
  payload: Record<string, unknown> = {},
): OrynEvent {
  return publishEvent(name, organizationId, payload);
}

export function emitEntityEvent(
  name: OrynEvent['name'],
  organizationId: string,
  entity: string,
  entityId: string,
  changes?: Record<string, unknown>,
): OrynEvent {
  return emitEvent(name, organizationId, { entity, entityId, ...(changes ? { changes } : {}) });
}
