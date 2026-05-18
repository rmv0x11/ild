import type { SyncState } from './types';

type Listener = (state: SyncState) => void;

function navigatorOnline(): boolean {
  if (typeof navigator === 'undefined') return true;
  return navigator.onLine !== false;
}

function initial(): SyncState {
  return {
    status: navigatorOnline() ? 'idle' : 'offline',
    lastSyncAt: null,
    error: null,
    pendingPush: { cards: 0, reviews: 0 },
  };
}

/**
 * Shared sync state — module-level so multiple components (the engine driver
 * and `SyncIndicator`) read from the same source without duplicating timers.
 */
let current: SyncState = initial();
const listeners = new Set<Listener>();

export function getSyncState(): SyncState {
  return current;
}

export function setSyncState(next: SyncState | ((prev: SyncState) => SyncState)): void {
  const value = typeof next === 'function' ? (next as (p: SyncState) => SyncState)(current) : next;
  if (value === current) return;
  current = value;
  listeners.forEach((l) => {
    try {
      l(current);
    } catch {
      // listener errors must not break notification fanout
    }
  });
}

export function subscribeSyncState(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** For tests: reset to fresh state and drop all subscribers. */
export function __resetSyncStateForTests(): void {
  current = initial();
  listeners.clear();
}
