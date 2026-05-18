import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/storage/db';
import { clearAll } from '@/lib/storage/cards';
import { logReview } from '@/lib/storage/reviews';
import { getStreak } from './streak';

const TZ_FIXED_NOON = (year: number, month: number, day: number): number => {
  const d = new Date(year, month - 1, day, 12, 0, 0, 0);
  return d.getTime();
};

const NOW = TZ_FIXED_NOON(2026, 5, 20);

async function seedReview(reviewedAt: number, cardId = 'c1'): Promise<void> {
  await logReview({
    cardId,
    rating: 'good',
    reviewedAt,
    stageBefore: 'new',
    stageAfter: 'learning',
    intervalDaysBefore: 0,
    intervalDaysAfter: 0,
    easeBefore: 2.5,
    easeAfter: 2.5,
  });
}

describe('getStreak', () => {
  beforeEach(async () => {
    await clearAll();
    await db.reviews.clear();
  });

  it('returns 0/0 when there are no reviews', async () => {
    await expect(getStreak(NOW)).resolves.toEqual({ current: 0, longest: 0 });
  });

  it('counts 1 day when reviewed only today', async () => {
    await seedReview(NOW);
    await expect(getStreak(NOW)).resolves.toEqual({ current: 1, longest: 1 });
  });

  it('counts 1 day when reviewed only yesterday (today not yet started)', async () => {
    await seedReview(TZ_FIXED_NOON(2026, 5, 19));
    await expect(getStreak(NOW)).resolves.toEqual({ current: 1, longest: 1 });
  });

  it('returns 0 when last review was 2+ days ago (streak broken)', async () => {
    await seedReview(TZ_FIXED_NOON(2026, 5, 17));
    const res = await getStreak(NOW);
    expect(res.current).toBe(0);
    expect(res.longest).toBe(1);
  });

  it('counts consecutive days back from today', async () => {
    for (let i = 0; i < 5; i++) {
      await seedReview(TZ_FIXED_NOON(2026, 5, 20 - i));
    }
    await expect(getStreak(NOW)).resolves.toEqual({ current: 5, longest: 5 });
  });

  it('multiple reviews on the same day count as a single day', async () => {
    await seedReview(TZ_FIXED_NOON(2026, 5, 20), 'a');
    await seedReview(TZ_FIXED_NOON(2026, 5, 20), 'b');
    await seedReview(TZ_FIXED_NOON(2026, 5, 20), 'c');
    await expect(getStreak(NOW)).resolves.toEqual({ current: 1, longest: 1 });
  });

  it('keeps a longest streak from history even when current is broken', async () => {
    // Old 7-day streak, then gap, then today
    for (let i = 0; i < 7; i++) {
      await seedReview(TZ_FIXED_NOON(2026, 5, 1 + i));
    }
    await seedReview(NOW);
    const res = await getStreak(NOW);
    expect(res.current).toBe(1);
    expect(res.longest).toBe(7);
  });
});
