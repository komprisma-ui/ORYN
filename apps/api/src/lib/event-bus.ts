export type OrynEventName =
  | 'customer.created'
  | 'customer.updated'
  | 'conversation.updated'
  | 'message.created'
  | 'lead.created'
  | 'lead.updated'
  | 'follow_up.created'
  | 'follow_up.updated';

export type OrynEvent<TPayload = Record<string, unknown>> = {
  id: string;
  name: OrynEventName;
  organizationId: string;
  occurredAt: string;
  payload: TPayload;
};

type Handler = (event: OrynEvent) => void | Promise<void>;

const handlers = new Map<OrynEventName, Set<Handler>>();

export function publishEvent<TPayload extends Record<string, unknown>>(
  name: OrynEventName,
  organizationId: string,
  payload: TPayload,
): OrynEvent<TPayload> {
  const event: OrynEvent<TPayload> = {
    id: crypto.randomUUID(),
    name,
    organizationId,
    occurredAt: new Date().toISOString(),
    payload,
  };

  const subscribers = handlers.get(name);
  if (subscribers) {
    for (const handler of subscribers) {
      Promise.resolve(handler(event)).catch(() => undefined);
    }
  }
  return event;
}

export function subscribeEvent(name: OrynEventName, handler: Handler): () => void {
  const subscribers = handlers.get(name) ?? new Set<Handler>();
  subscribers.add(handler);
  handlers.set(name, subscribers);
  return () => subscribers.delete(handler);
}

export function clearEventSubscribers(): void {
  handlers.clear();
}
