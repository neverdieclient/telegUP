/**
 * Tiny pub/sub for "the server says this caller is banned".
 *
 * Kept dependency-free on purpose: `players.ts` (the data layer) must be able
 * to raise the flag without importing the game store, which would create an
 * import cycle (store → players → store). The store subscribes here instead.
 */
type Listener = () => void;

const listeners = new Set<Listener>();

/** Subscribe; returns an unsubscribe function. */
export function onBanSignal(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Raise the ban flag. Called when a server RPC rejects with 'banned'. */
export function signalBanned(): void {
  for (const fn of listeners) fn();
}
