import { useCallback, useEffect, useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import {
  start as engineStart,
  syncOnce as engineSyncOnce,
  getPendingCounts,
  SyncUnauthorizedError,
} from './engine';
import { getMeta, META_KEYS } from './meta';
import {
  getSyncState,
  setSyncState,
  subscribeSyncState,
} from './store';
import type { SyncState } from './types';

export interface UseSyncOptions {
  enabled: boolean;
  intervalMs?: number;
}

export interface UseSyncResult {
  state: SyncState;
  syncNow: () => Promise<void>;
}

function navigatorOnline(): boolean {
  if (typeof navigator === 'undefined') return true;
  return navigator.onLine !== false;
}

/**
 * Subscribe to the shared sync state without starting the engine.
 * Use this in display-only components (e.g. SyncIndicator).
 */
export function useSyncState(): SyncState {
  return useSyncExternalStore(subscribeSyncState, getSyncState, getSyncState);
}

/**
 * Owner hook: starts the periodic engine, reacts to visibility/online events,
 * and writes status into the shared store. Should be mounted exactly once
 * (typically in Layout) for authenticated users.
 */
export function useSync(options: UseSyncOptions): UseSyncResult {
  const { enabled, intervalMs = 30_000 } = options;
  const state = useSyncState();

  const enabledRef = useRef(enabled);
  // Sync ref outside render to satisfy react-hooks/refs.
  useLayoutEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);
  const runningRef = useRef(false);

  const refreshPending = useCallback(async (): Promise<void> => {
    try {
      const pending = await getPendingCounts();
      setSyncState((s) => ({ ...s, pendingPush: pending }));
    } catch {
      // best-effort
    }
  }, []);

  const syncNow = useCallback(async (): Promise<void> => {
    if (!enabledRef.current) return;
    if (runningRef.current) return;
    if (!navigatorOnline()) {
      setSyncState((s) => ({ ...s, status: 'offline' }));
      return;
    }
    runningRef.current = true;
    setSyncState((s) => ({ ...s, status: 'syncing', error: null }));
    try {
      await engineSyncOnce();
      const lastRaw = await getMeta(META_KEYS.lastFullSync);
      const lastSyncAt = lastRaw ? Number(lastRaw) : Date.now();
      const pending = await getPendingCounts();
      setSyncState({
        status: 'idle',
        lastSyncAt: Number.isFinite(lastSyncAt) ? lastSyncAt : Date.now(),
        error: null,
        pendingPush: pending,
      });
    } catch (err) {
      const message =
        err instanceof SyncUnauthorizedError
          ? 'Не авторизован'
          : err instanceof Error
            ? err.message
            : 'Ошибка синхронизации';
      setSyncState((s) => ({ ...s, status: 'error', error: message }));
    } finally {
      runningRef.current = false;
    }
  }, []);

  // Periodic engine + initial kick.
  useEffect(() => {
    if (!enabled) {
      setSyncState((s) => ({
        ...s,
        status: navigatorOnline() ? 'idle' : 'offline',
        error: null,
      }));
      return;
    }
    void refreshPending();
    void syncNow();
    const stop = engineStart(intervalMs);
    return () => {
      stop();
    };
  }, [enabled, intervalMs, refreshPending, syncNow]);

  // visibility & online/offline transitions
  useEffect(() => {
    if (!enabled) return;

    const onVisibility = (): void => {
      if (typeof document !== 'undefined' && !document.hidden) {
        void syncNow();
      }
    };
    const onOnline = (): void => {
      setSyncState((s) => (s.status === 'offline' ? { ...s, status: 'idle' } : s));
      void syncNow();
    };
    const onOffline = (): void => {
      setSyncState((s) => ({ ...s, status: 'offline' }));
    };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [enabled, syncNow]);

  return { state, syncNow };
}
