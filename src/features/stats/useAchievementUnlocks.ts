import { useEffect, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { toast } from 'sonner';
import {
  ACHIEVEMENTS,
  computeUnlocked,
  gatherAchievementStats,
} from '@/lib/stats/achievements';

const SEEN_LS_KEY = 'ild:achievements:seen';

function loadSeen(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = window.localStorage.getItem(SEEN_LS_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((v): v is string => typeof v === 'string'));
  } catch {
    return new Set();
  }
}

function saveSeen(seen: Set<string>): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SEEN_LS_KEY, JSON.stringify(Array.from(seen)));
  } catch {
    /* ignored */
  }
}

/**
 * Diff currently-unlocked achievements against the set we've previously toast-
 * notified about, and surface the new ones via sonner.
 *
 * First-time mount with a non-empty unlock list (e.g. user upgrades the app
 * and already had reviews) silently seeds the seen set — we don't want to
 * dump 5 toasts on page load.
 */
export function useAchievementUnlocks(): void {
  const seenRef = useRef<Set<string> | null>(null);
  const stats = useLiveQuery(() => gatherAchievementStats(Date.now()), []);

  useEffect(() => {
    if (!stats) return;
    const unlocked = computeUnlocked(stats);

    if (seenRef.current === null) {
      const loaded = loadSeen();
      if (loaded.size === 0 && unlocked.size > 0) {
        seenRef.current = new Set(unlocked);
        saveSeen(seenRef.current);
        return;
      }
      seenRef.current = loaded;
    }

    const newlyUnlocked = ACHIEVEMENTS.filter(
      (a) => unlocked.has(a.id) && !seenRef.current!.has(a.id),
    );

    if (newlyUnlocked.length === 0) return;

    for (const a of newlyUnlocked) {
      toast.success(`${a.icon} ${a.title}`, {
        description: a.description,
        duration: 5000,
      });
      seenRef.current.add(a.id);
    }
    saveSeen(seenRef.current);
  }, [stats]);
}
