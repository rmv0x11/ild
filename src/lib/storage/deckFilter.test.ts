import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DECK_ALL,
  getDeckFilter,
  matchesDeckFilter,
  setDeckFilter,
  subscribeDeckFilter,
} from './deckFilter';

describe('deckFilter', () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it('returns DECK_ALL when nothing is stored', () => {
    expect(getDeckFilter()).toBe(DECK_ALL);
  });

  it('round-trips a non-default deck filter through localStorage', () => {
    setDeckFilter('hsk-1');
    expect(getDeckFilter()).toBe('hsk-1');
    expect(window.localStorage.getItem('ild:deck-filter')).toBe('hsk-1');
  });

  it('setting DECK_ALL clears the persisted entry', () => {
    setDeckFilter('hsk-1');
    setDeckFilter(DECK_ALL);
    expect(getDeckFilter()).toBe(DECK_ALL);
    expect(window.localStorage.getItem('ild:deck-filter')).toBeNull();
  });

  it('notifies subscribers on change and stops after unsubscribe', () => {
    const listener = vi.fn();
    const unsub = subscribeDeckFilter(listener);
    setDeckFilter('hsk-2');
    expect(listener).toHaveBeenCalledTimes(1);
    unsub();
    setDeckFilter('hsk-3');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('matchesDeckFilter respects DECK_ALL as a wildcard', () => {
    expect(matchesDeckFilter('hsk-1', DECK_ALL)).toBe(true);
    expect(matchesDeckFilter(undefined, DECK_ALL)).toBe(true);
    expect(matchesDeckFilter('hsk-1', 'hsk-1')).toBe(true);
    expect(matchesDeckFilter('hsk-1', 'hsk-2')).toBe(false);
    expect(matchesDeckFilter(undefined, 'hsk-1')).toBe(false);
  });
});
