// Tiny localStorage-backed setting that holds the active deck filter (a
// preset id like "hsk-1", "topic-food", etc.) or DECK_ALL when the user is
// reviewing the whole collection. Lives here next to the storage layer so
// the queries can read it directly without React.
//
// We expose a subscribe() API so the UI can re-render reactively when the
// filter changes — necessary because localStorage 'storage' events only fire
// across tabs, not within the current tab.

const LS_KEY = 'ild:deck-filter';

/** Sentinel value meaning "no filter — show every card regardless of deck". */
export const DECK_ALL = '__all__';

const listeners = new Set<() => void>();

function notify(): void {
  for (const fn of listeners) {
    try {
      fn();
    } catch {
      /* ignored */
    }
  }
}

export function getDeckFilter(): string {
  if (typeof window === 'undefined') return DECK_ALL;
  try {
    return window.localStorage.getItem(LS_KEY) ?? DECK_ALL;
  } catch {
    return DECK_ALL;
  }
}

export function setDeckFilter(deckId: string): void {
  if (typeof window === 'undefined') return;
  try {
    if (deckId === DECK_ALL) {
      window.localStorage.removeItem(LS_KEY);
    } else {
      window.localStorage.setItem(LS_KEY, deckId);
    }
  } catch {
    /* ignored */
  }
  notify();
}

export function subscribeDeckFilter(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** True iff `deckId` matches `filter` (i.e., the card should be visible). */
export function matchesDeckFilter(deckId: string | undefined, filter: string): boolean {
  if (filter === DECK_ALL) return true;
  return deckId === filter;
}
