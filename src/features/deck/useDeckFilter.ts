import { useEffect, useState } from 'react';
import {
  getDeckFilter,
  setDeckFilter,
  subscribeDeckFilter,
} from '@/lib/storage/deckFilter';

/**
 * React hook around the deck filter setting in localStorage.
 *
 * Returns the current filter (DECK_ALL or a deck id) and a setter that
 * persists the new value AND notifies every other subscriber on the page —
 * so the dropdown on Review and the same dropdown on Stats stay in sync
 * without prop drilling.
 */
export function useDeckFilter(): [string, (id: string) => void] {
  const [filter, setFilterState] = useState<string>(() => getDeckFilter());

  useEffect(() => {
    return subscribeDeckFilter(() => {
      setFilterState(getDeckFilter());
    });
  }, []);

  return [filter, setDeckFilter];
}
