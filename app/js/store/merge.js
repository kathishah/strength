// What to keep when an event we may already hold arrives again (from the server, or a retry).
// Events are immutable except for recvAt, which only the server sets: our own copy has none until
// the server's copy comes back. Returns `existing` itself when nothing changes.
export function mergeEvent(existing, incoming) {
  if (!existing) return incoming;
  if (existing.recvAt === undefined && incoming.recvAt !== undefined) return { ...existing, recvAt: incoming.recvAt };
  return existing;
}

export const isEventLike = (x) => x !== null && typeof x === 'object' && !Array.isArray(x) && typeof x.id === 'string';
