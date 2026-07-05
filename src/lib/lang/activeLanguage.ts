// The active study language — a tiny localStorage-backed setting, mirroring the
// deck-filter store next door. Everything the user sees (review queue, deck
// list, stats, import target, preset gallery) is scoped to this one language so
// the two "study worlds" (Chinese / Korean) stay cleanly separated.
//
// We expose subscribe() so the UI re-renders reactively within the tab
// (localStorage 'storage' events only fire cross-tab).

import type { Language } from '@/types/domain';
import { DEFAULT_LANGUAGE, normalizeLanguage } from './language';
import { DECK_ALL, setDeckFilter } from '@/lib/storage/deckFilter';

const LS_KEY = 'ild:lang';

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

export function getActiveLanguage(): Language {
  if (typeof window === 'undefined') return DEFAULT_LANGUAGE;
  try {
    return normalizeLanguage(window.localStorage.getItem(LS_KEY));
  } catch {
    return DEFAULT_LANGUAGE;
  }
}

export function setActiveLanguage(lang: Language): void {
  if (typeof window === 'undefined') return;
  const prev = getActiveLanguage();
  try {
    window.localStorage.setItem(LS_KEY, lang);
  } catch {
    /* ignored */
  }
  // A deck filter from the previous language is meaningless under the new one —
  // reset it to "all" so the user isn't left with an empty, confusing queue.
  if (prev !== lang) {
    setDeckFilter(DECK_ALL);
  }
  notify();
}

export function subscribeActiveLanguage(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
