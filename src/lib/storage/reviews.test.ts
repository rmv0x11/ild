import { beforeEach, describe, expect, it } from 'vitest';
import type { ReviewLog } from '@/types/domain';
import { db } from './db';
import { getReviewsFor, logReview } from './reviews';

function makeLog(overrides: Partial<ReviewLog> = {}): Omit<ReviewLog, 'id'> {
  return {
    cardId: 'card-1',
    rating: 'good',
    reviewedAt: 1_000,
    stageBefore: 'new',
    stageAfter: 'learning',
    intervalDaysBefore: 0,
    intervalDaysAfter: 0,
    easeBefore: 2.5,
    easeAfter: 2.5,
    ...overrides,
  };
}

describe('reviews repository', () => {
  beforeEach(async () => {
    await db.reviews.clear();
  });

  it('logReview persists a single review and getReviewsFor returns it', async () => {
    await logReview(makeLog());
    const list = await getReviewsFor('card-1');
    expect(list).toHaveLength(1);
    expect(list[0].cardId).toBe('card-1');
    expect(list[0].rating).toBe('good');
    expect(list[0].id).toBeTypeOf('number');
  });

  it('returns reviews sorted ascending by reviewedAt', async () => {
    await logReview(makeLog({ reviewedAt: 3_000 }));
    await logReview(makeLog({ reviewedAt: 1_000 }));
    await logReview(makeLog({ reviewedAt: 2_000 }));

    const list = await getReviewsFor('card-1');
    expect(list.map((r) => r.reviewedAt)).toEqual([1_000, 2_000, 3_000]);
  });

  it('filters by cardId', async () => {
    await logReview(makeLog({ cardId: 'card-A', reviewedAt: 1 }));
    await logReview(makeLog({ cardId: 'card-B', reviewedAt: 2 }));
    await logReview(makeLog({ cardId: 'card-A', reviewedAt: 3 }));

    const a = await getReviewsFor('card-A');
    const b = await getReviewsFor('card-B');

    expect(a).toHaveLength(2);
    expect(a.every((r) => r.cardId === 'card-A')).toBe(true);
    expect(b).toHaveLength(1);
    expect(b[0].cardId).toBe('card-B');
  });

  it('returns [] for an unknown cardId', async () => {
    await logReview(makeLog({ cardId: 'real' }));
    const list = await getReviewsFor('missing');
    expect(list).toEqual([]);
  });
});
