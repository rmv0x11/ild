import { useEffect, useState } from 'react';
import { AlertTriangle, Check, CloudOff, Loader2, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSyncState } from './useSync';
import { syncOnce as engineSyncOnce } from './engine';
import { setSyncState } from './store';
import type { SyncState } from './types';

export interface SyncIndicatorProps {
  /** Optional override — by default reads from the shared sync store. */
  state?: SyncState;
  /** Optional retry handler — defaults to invoking the engine directly. */
  onRetry?: () => void;
  className?: string;
}

function formatRelative(now: number, then: number): string {
  const diff = Math.max(0, now - then);
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'только что';
  if (minutes < 60) return `${minutes} мин назад`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ч назад`;
  const days = Math.floor(hours / 24);
  return `${days} дн назад`;
}

async function defaultRetry(): Promise<void> {
  setSyncState((s) => ({ ...s, status: 'syncing', error: null }));
  try {
    await engineSyncOnce();
    setSyncState((s) => ({ ...s, status: 'idle', error: null, lastSyncAt: Date.now() }));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Ошибка синхронизации';
    setSyncState((s) => ({ ...s, status: 'error', error: message }));
  }
}

export function SyncIndicator({ state: stateProp, onRetry, className }: SyncIndicatorProps = {}) {
  const storeState = useSyncState();
  const state = stateProp ?? storeState;

  // Re-render every minute so "N мин назад" stays current.
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    const handle = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(handle);
  }, []);

  const baseClasses = 'inline-flex items-center gap-1.5 text-xs';

  if (state.status === 'syncing') {
    return (
      <span
        className={cn(baseClasses, 'text-muted-foreground', className)}
        aria-live="polite"
        title="Синхронизация…"
      >
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
        <span className="hidden sm:inline">Синхронизация…</span>
      </span>
    );
  }

  if (state.status === 'offline') {
    return (
      <span
        className={cn(baseClasses, 'text-muted-foreground', className)}
        title="Офлайн"
      >
        <CloudOff className="h-3.5 w-3.5" aria-hidden />
        <span className="hidden sm:inline">Офлайн</span>
      </span>
    );
  }

  if (state.status === 'error') {
    const message = state.error ?? 'Ошибка синхронизации';
    return (
      <span className={cn(baseClasses, 'text-destructive', className)} title={message}>
        <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
        <span className="hidden sm:inline">{message}</span>
        <button
          type="button"
          onClick={() => {
            if (onRetry) {
              onRetry();
            } else {
              void defaultRetry();
            }
          }}
          className="ml-1 inline-flex items-center gap-1 rounded-md border border-input bg-background px-1.5 py-0.5 text-[10px] font-medium hover:bg-accent"
          aria-label="Повторить синхронизацию"
        >
          <RefreshCw className="h-3 w-3" aria-hidden />
          Повторить
        </button>
      </span>
    );
  }

  // idle
  if (state.lastSyncAt) {
    const tooltip = `Синхронизировано ${formatRelative(now, state.lastSyncAt)}`;
    return (
      <span
        className={cn(baseClasses, 'text-muted-foreground', className)}
        title={tooltip}
      >
        <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden />
        <span className="hidden sm:inline">{tooltip}</span>
      </span>
    );
  }

  // idle without lastSyncAt — render a stable empty marker.
  return <span className={cn(baseClasses, 'text-muted-foreground', className)} aria-hidden />;
}
