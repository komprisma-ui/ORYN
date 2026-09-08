import type { OrynEvent } from './event-bus.js';
import { subscribeEvent } from './event-bus.js';

export type RealtimeClient = {
  organizationId: string;
  send: (event: OrynEvent) => void;
  close: () => void;
};

const clients = new Set<RealtimeClient>();

export function addRealtimeClient(client: RealtimeClient): () => void {
  clients.add(client);
  return () => clients.delete(client);
}

export function broadcastRealtimeEvent(event: OrynEvent): void {
  for (const client of clients) {
    if (client.organizationId !== event.organizationId) continue;
    try {
      client.send(event);
    } catch {
      client.close();
      clients.delete(client);
    }
  }
}

const realtimeEventNames: OrynEvent['name'][] = [
  'customer.created',
  'customer.updated',
  'conversation.updated',
  'message.created',
  'lead.created',
  'lead.updated',
  'follow_up.created',
  'follow_up.updated',
];

for (const name of realtimeEventNames) {
  subscribeEvent(name, broadcastRealtimeEvent);
}

export function realtimeClientCount(organizationId?: string): number {
  return organizationId ? [...clients].filter(client => client.organizationId === organizationId).length : clients.size;
}
