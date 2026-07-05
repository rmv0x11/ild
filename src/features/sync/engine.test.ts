import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/lib/storage/db';
import type { Card, ReviewLog } from '@/types/domain';
import type { CardWire, ReviewWire } from './types';

// Mock the API surface before importing the engine so the engine binds to
// the mocked module.
vi.mock('./api', () => ({
  pullCards: vi.fn(),
  pushCards: vi.fn(),
  pullReviews: vi.fn(),
  pushReviews: vi.fn(),
  deleteCardOnServer: vi.fn(),
}));

import * as api from './api';
import { pull, push, syncOnce, getPendingCounts } from './engine';
import { META_KEYS, getWatermark } from './meta';

const mockedPullCards = vi.mocked(api.pullCards);
const mockedPushCards = vi.mocked(api.pushCards);
const mockedPullReviews = vi.mocked(api.pullReviews);
const mockedPushReviews = vi.mocked(api.pushReviews);

function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    id: overrides.id ?? 'card-1',
    lang: 'zh',
    word: '你好',
    pinyin: 'nǐ hǎo',
    context: 'hello',
    stage: 'new',
    learningStep: 0,
    intervalDays: 0,
    ease: 2.5,
    dueAt: 1_000,
    reps: 0,
    lapses: 0,
    createdAt: 1_000,
    updatedAt: 1_000,
    ...overrides,
  };
}

async function clearAll(): Promise<void> {
  await db.transaction('rw', db.cards, db.reviews, db.meta, async () => {
    await db.cards.clear();
    await db.reviews.clear();
    await db.meta.clear();
  });
}

beforeEach(async () => {
  vi.clearAllMocks();
  await clearAll();
  // Default: no data from the server.
  mockedPullCards.mockResolvedValue({ cards: [], nextSince: 0 });
  mockedPullReviews.mockResolvedValue({ reviews: [], nextSince: 0 });
  mockedPushCards.mockResolvedValue({ applied: 0 });
  mockedPushReviews.mockResolvedValue({ applied: 0 });
});

describe('engine.pull (cards)', () => {
  it('places pulled cards into Dexie and advances the watermark', async () => {
    const cards: CardWire[] = [
      { ...makeCard({ id: 'a', updatedAt: 100 }) },
      { ...makeCard({ id: 'b', updatedAt: 200 }) },
    ];
    mockedPullCards.mockResolvedValueOnce({ cards, nextSince: 200 });

    const { cardsPulled } = await pull();

    expect(cardsPulled).toBe(2);
    const stored = await db.cards.toArray();
    expect(stored).toHaveLength(2);
    expect(stored.map((c) => c.id).sort()).toEqual(['a', 'b']);
    expect(await getWatermark(META_KEYS.cardsLastPulled)).toBe(200);
  });

  it('deletes local cards when the server reports a tombstone', async () => {
    await db.cards.put(makeCard({ id: 'doomed', updatedAt: 100 }));
    const cards: CardWire[] = [{ ...makeCard({ id: 'doomed', updatedAt: 200 }), deletedAt: 199 }];
    mockedPullCards.mockResolvedValueOnce({ cards, nextSince: 250 });

    await pull();

    expect(await db.cards.get('doomed')).toBeUndefined();
    expect(await getWatermark(META_KEYS.cardsLastPulled)).toBe(250);
  });

  it('skips overwrite when local copy is newer (LWW)', async () => {
    await db.cards.put(makeCard({ id: 'a', updatedAt: 500, word: 'local' }));
    const cards: CardWire[] = [{ ...makeCard({ id: 'a', updatedAt: 300, word: 'server' }) }];
    mockedPullCards.mockResolvedValueOnce({ cards, nextSince: 300 });

    await pull();

    const stored = await db.cards.get('a');
    expect(stored?.word).toBe('local');
    expect(stored?.updatedAt).toBe(500);
  });

  it('preserves the local language when the server echoes a card without lang', async () => {
    await db.cards.put(makeCard({ id: 'a', lang: 'ko', word: '사과', updatedAt: 100 }));
    // The sync server predates multi-language and returns the card with no lang.
    const wire = { ...makeCard({ id: 'a', word: '사과', updatedAt: 200 }) } as CardWire;
    delete (wire as { lang?: unknown }).lang;
    mockedPullCards.mockResolvedValueOnce({ cards: [wire], nextSince: 200 });

    await pull();

    const stored = await db.cards.get('a');
    expect(stored?.lang).toBe('ko');
    expect(stored?.updatedAt).toBe(200);
  });

  it('defaults lang to zh for a lang-less card with no local copy', async () => {
    const wire = { ...makeCard({ id: 'fresh', updatedAt: 100 }) } as CardWire;
    delete (wire as { lang?: unknown }).lang;
    mockedPullCards.mockResolvedValueOnce({ cards: [wire], nextSince: 100 });

    await pull();

    expect((await db.cards.get('fresh'))?.lang).toBe('zh');
  });

  it('overwrites when server copy is newer (LWW)', async () => {
    await db.cards.put(makeCard({ id: 'a', updatedAt: 100, word: 'old' }));
    const cards: CardWire[] = [{ ...makeCard({ id: 'a', updatedAt: 999, word: 'new' }) }];
    mockedPullCards.mockResolvedValueOnce({ cards, nextSince: 999 });

    await pull();

    const stored = await db.cards.get('a');
    expect(stored?.word).toBe('new');
    expect(stored?.updatedAt).toBe(999);
  });

  it('drains multiple pages until nextSince stops advancing', async () => {
    // Build a single full page + a short page to simulate end-of-stream.
    const fullPage: CardWire[] = Array.from({ length: 500 }, (_, i) =>
      makeCard({ id: `c${i}`, updatedAt: 100 + i }),
    );
    mockedPullCards.mockResolvedValueOnce({ cards: fullPage, nextSince: 599 });
    mockedPullCards.mockResolvedValueOnce({
      cards: [makeCard({ id: 'tail', updatedAt: 700 })],
      nextSince: 700,
    });

    const { cardsPulled } = await pull();

    expect(cardsPulled).toBe(501);
    expect(mockedPullCards).toHaveBeenCalledTimes(2);
    expect(await getWatermark(META_KEYS.cardsLastPulled)).toBe(700);
  });
});

describe('engine.pull (reviews)', () => {
  it('appends pulled reviews and advances the reviews watermark', async () => {
    const reviews: ReviewWire[] = [
      {
        id: 11,
        cardId: 'a',
        rating: 'good',
        reviewedAt: 100,
        stageBefore: 'new',
        stageAfter: 'learning',
        intervalDaysBefore: 0,
        intervalDaysAfter: 0,
        easeBefore: 2.5,
        easeAfter: 2.5,
      },
    ];
    mockedPullReviews.mockResolvedValueOnce({ reviews, nextSince: 100 });

    const { reviewsPulled } = await pull();

    expect(reviewsPulled).toBe(1);
    expect(await db.reviews.count()).toBe(1);
    expect(await getWatermark(META_KEYS.reviewsLastPulled)).toBe(100);
  });
});

describe('engine.push (cards)', () => {
  it('sends only cards with updatedAt > watermark', async () => {
    await db.meta.put({ key: META_KEYS.cardsLastPushed, value: '500' });
    await db.cards.bulkPut([
      makeCard({ id: 'old', updatedAt: 100 }),
      makeCard({ id: 'fresh', updatedAt: 600 }),
      makeCard({ id: 'fresher', updatedAt: 900 }),
    ]);

    const { cardsPushed } = await push();

    expect(cardsPushed).toBe(2);
    expect(mockedPushCards).toHaveBeenCalledTimes(1);
    const sent = mockedPushCards.mock.calls[0][0];
    expect(sent.map((c) => c.id).sort()).toEqual(['fresh', 'fresher']);
    expect(await getWatermark(META_KEYS.cardsLastPushed)).toBe(900);
  });

  it('does not call pushCards when there is nothing to send', async () => {
    await db.meta.put({ key: META_KEYS.cardsLastPushed, value: '0' });
    const { cardsPushed } = await push();
    expect(cardsPushed).toBe(0);
    expect(mockedPushCards).not.toHaveBeenCalled();
  });

  it('splits >500 cards into batches and advances the watermark stepwise', async () => {
    const cards: Card[] = Array.from({ length: 750 }, (_, i) =>
      makeCard({ id: `c${i}`, updatedAt: i + 1 }),
    );
    await db.cards.bulkPut(cards);

    const { cardsPushed } = await push();

    expect(cardsPushed).toBe(750);
    expect(mockedPushCards).toHaveBeenCalledTimes(2);
    expect(await getWatermark(META_KEYS.cardsLastPushed)).toBe(750);
  });
});

describe('engine.push (reviews)', () => {
  it('sends only reviews with reviewedAt > watermark', async () => {
    await db.meta.put({ key: META_KEYS.reviewsLastPushed, value: '50' });
    const logs: ReviewLog[] = [
      {
        id: 1,
        cardId: 'a',
        rating: 'good',
        reviewedAt: 10,
        stageBefore: 'new',
        stageAfter: 'learning',
        intervalDaysBefore: 0,
        intervalDaysAfter: 0,
        easeBefore: 2.5,
        easeAfter: 2.5,
      },
      {
        id: 2,
        cardId: 'a',
        rating: 'good',
        reviewedAt: 100,
        stageBefore: 'learning',
        stageAfter: 'young',
        intervalDaysBefore: 0,
        intervalDaysAfter: 1,
        easeBefore: 2.5,
        easeAfter: 2.5,
      },
    ];
    await db.reviews.bulkPut(logs);

    const { reviewsPushed } = await push();

    expect(reviewsPushed).toBe(1);
    const sent = mockedPushReviews.mock.calls[0][0];
    expect(sent.map((r) => r.id)).toEqual([2]);
    expect(await getWatermark(META_KEYS.reviewsLastPushed)).toBe(100);
  });
});

describe('engine.syncOnce', () => {
  it('runs pull then push and records lastFullSyncAt', async () => {
    await db.cards.put(makeCard({ id: 'fresh', updatedAt: 200 }));
    mockedPullCards.mockResolvedValueOnce({ cards: [], nextSince: 0 });

    await syncOnce(123_456);

    expect(mockedPullCards).toHaveBeenCalled();
    expect(mockedPushCards).toHaveBeenCalled();
    const lastRaw = await db.meta.get(META_KEYS.lastFullSync);
    expect(lastRaw?.value).toBe('123456');
  });
});

describe('engine.getPendingCounts', () => {
  it('reports unpushed cards and reviews relative to watermark', async () => {
    await db.meta.put({ key: META_KEYS.cardsLastPushed, value: '100' });
    await db.meta.put({ key: META_KEYS.reviewsLastPushed, value: '100' });
    await db.cards.bulkPut([
      makeCard({ id: 'old', updatedAt: 50 }),
      makeCard({ id: 'new', updatedAt: 200 }),
    ]);
    await db.reviews.put({
      id: 1,
      cardId: 'x',
      rating: 'good',
      reviewedAt: 200,
      stageBefore: 'new',
      stageAfter: 'learning',
      intervalDaysBefore: 0,
      intervalDaysAfter: 0,
      easeBefore: 2.5,
      easeAfter: 2.5,
    });

    const counts = await getPendingCounts();
    expect(counts).toEqual({ cards: 1, reviews: 1 });
  });
});
