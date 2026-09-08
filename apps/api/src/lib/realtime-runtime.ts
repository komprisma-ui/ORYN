import { getRecentEvents } from './event-journal.js';
import { addRealtimeClient } from './realtime.js';

export type RealtimeWriter = {
  write: (chunk: string) => void;
  end: () => void;
};

export function attachEventStream(
  organizationId: string,
  writer: RealtimeWriter,
  lastEventId?: string,
): () => void {
  const recent = getRecentEvents(organizationId, 100);
  const start = lastEventId ? recent.findIndex(event => event.id === lastEventId) : -1;
  const backlog = start >= 0 ? recent.slice(0, start) .reverse() : [...recent].reverse();

  for (const event of backlog) {
    writer.write(`id: ${event.id}\nevent: ${event.name}\ndata: ${JSON.stringify(event)}\n\n`);
  }

  writer.write(': connected\n\n');
  const remove = addRealtimeClient({
    organizationId,
    send: event => writer.write(`id: ${event.id}\nevent: ${event.name}\ndata: ${JSON.stringify(event)}\n\n`),
    close: () => writer.end(),
  });

  return remove;
}
