import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/storage/db';
import { clearAll } from '@/lib/storage/cards';
import { loadSampleDeck } from './loadSampleDeck';

describe('loadSampleDeck', () => {
  beforeEach(async () => {
    await clearAll();
  });

  it('returns {added: 2, skipped: 0} on an empty deck', async () => {
    const result = await loadSampleDeck(Date.now());
    expect(result).toEqual({ added: 2, skipped: 0 });
  });

  it('inserts 2 sample cards into the database', async () => {
    await loadSampleDeck(Date.now());
    expect(await db.cards.count()).toBe(2);
  });

  it('skips cards with words that already exist', async () => {
    const now = Date.now();
    await loadSampleDeck(now);
    expect(await db.cards.count()).toBe(2);

    const second = await loadSampleDeck(now);
    expect(second).toEqual({ added: 0, skipped: 2 });
    expect(await db.cards.count()).toBe(2);
  });
});
