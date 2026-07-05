import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getActiveLanguage, setActiveLanguage, subscribeActiveLanguage } from './activeLanguage';
import { DECK_ALL, getDeckFilter, setDeckFilter } from '@/lib/storage/deckFilter';

describe('activeLanguage store', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(() => {
    window.localStorage.clear();
  });

  it('defaults to Chinese', () => {
    expect(getActiveLanguage()).toBe('zh');
  });

  it('persists and reads back a language', () => {
    setActiveLanguage('ko');
    expect(getActiveLanguage()).toBe('ko');
  });

  it('normalizes a garbage stored value', () => {
    window.localStorage.setItem('ild:lang', 'klingon');
    expect(getActiveLanguage()).toBe('zh');
  });

  it('notifies subscribers on change', () => {
    const listener = vi.fn();
    const unsub = subscribeActiveLanguage(listener);
    setActiveLanguage('ko');
    expect(listener).toHaveBeenCalled();
    unsub();
    listener.mockClear();
    setActiveLanguage('zh');
    expect(listener).not.toHaveBeenCalled();
  });

  it('resets the deck filter when the language actually changes', () => {
    setDeckFilter('hsk-1');
    expect(getDeckFilter()).toBe('hsk-1');
    setActiveLanguage('ko');
    expect(getDeckFilter()).toBe(DECK_ALL);
  });

  it('does not reset the deck filter when the language is unchanged', () => {
    // Active language is 'zh' by default; setting it to 'zh' is a no-op.
    setDeckFilter('hsk-2');
    setActiveLanguage('zh');
    expect(getDeckFilter()).toBe('hsk-2');
  });
});
