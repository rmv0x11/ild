import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CsvRow } from '@/types/domain';
import { db } from './db';
import {
  addCards,
  clearAll,
  getAllCards,
  getKnownDeckIds,
  getNextDueCard,
  getStats,
} from './cards';

const row = (word: string): CsvRow => ({ word, pinyin: `${word}-r`, context: `**${word}** ctx` });

async function reset(): Promise<void> {
  await db.cards.clear();
  await db.reviews.clear();
}

describe('storage language scoping', () => {
  beforeEach(reset);
  afterEach(reset);

  it('getAllCards / getStats are scoped to one language', async () => {
    const now = Date.now();
    await addCards([row('中'), row('文')], now, { lang: 'zh' });
    await addCards([row('한'), row('국'), row('어')], now, { lang: 'ko' });

    expect((await getAllCards('zh')).length).toBe(2);
    expect((await getAllCards('ko')).length).toBe(3);

    const zhStats = await getStats(now, 'zh');
    const koStats = await getStats(now, 'ko');
    expect(zhStats.total).toBe(2);
    expect(zhStats.dueNow).toBe(2);
    expect(koStats.total).toBe(3);
    expect(koStats.dueNow).toBe(3);
  });

  it('getNextDueCard returns a card of the requested language', async () => {
    const now = Date.now();
    await addCards([row('猫')], now, { lang: 'zh' });
    await addCards([row('개')], now, { lang: 'ko' });

    expect((await getNextDueCard(now, 'zh'))?.word).toBe('猫');
    expect((await getNextDueCard(now, 'ko'))?.word).toBe('개');
  });

  it('addCards dedupes within a language but allows the same string across languages', async () => {
    const now = Date.now();
    const a = await addCards([row('X')], now, { lang: 'zh' });
    const b = await addCards([row('X')], now, { lang: 'ko' });
    const c = await addCards([row('X')], now, { lang: 'zh' });
    expect(a).toEqual({ added: 1, skipped: 0 });
    expect(b).toEqual({ added: 1, skipped: 0 });
    expect(c).toEqual({ added: 0, skipped: 1 });
    expect((await db.cards.where('word').equals('X').toArray()).length).toBe(2);
  });

  it('getKnownDeckIds is scoped by language, or global without one', async () => {
    const now = Date.now();
    await addCards([row('甲')], now, { lang: 'zh', deckId: 'hsk-1' });
    await addCards([row('갑')], now, { lang: 'ko', deckId: 'topik-1' });
    expect(await getKnownDeckIds('zh')).toEqual(['hsk-1']);
    expect(await getKnownDeckIds('ko')).toEqual(['topik-1']);
    expect(await getKnownDeckIds()).toEqual(['hsk-1', 'topik-1']);
  });

  it('clearAll(lang) removes only that language and its reviews', async () => {
    const now = Date.now();
    await addCards([row('汉')], now, { lang: 'zh' });
    await addCards([row('말')], now, { lang: 'ko' });
    const [zhCard] = await getAllCards('zh');
    const [koCard] = await getAllCards('ko');
    const mkReview = (cardId: string) => ({
      cardId,
      rating: 'good' as const,
      reviewedAt: now,
      stageBefore: 'new' as const,
      stageAfter: 'learning' as const,
      intervalDaysBefore: 0,
      intervalDaysAfter: 0,
      easeBefore: 2.5,
      easeAfter: 2.5,
    });
    await db.reviews.add(mkReview(zhCard.id));
    await db.reviews.add(mkReview(koCard.id));

    await clearAll('ko');

    expect((await getAllCards('ko')).length).toBe(0);
    expect((await getAllCards('zh')).length).toBe(1);
    expect(await db.reviews.where('cardId').equals(koCard.id).count()).toBe(0);
    expect(await db.reviews.where('cardId').equals(zhCard.id).count()).toBe(1);
  });
});
