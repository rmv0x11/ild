import { beforeEach, describe, expect, it } from 'vitest';
import type { Card } from '@/types/domain';
import { db } from '@/lib/storage/db';
import { clearAll } from '@/lib/storage/cards';
import { logReview } from '@/lib/storage/reviews';
import {
  ACHIEVEMENTS,
  computeUnlocked,
  gatherAchievementStats,
  type AchievementStats,
} from './achievements';

const NOW = new Date(2026, 4, 20, 12, 0, 0).getTime();

function makeCard(partial: Partial<Card> & Pick<Card, 'id' | 'word'>): Card {
  return {
    id: partial.id,
    word: partial.word,
    pinyin: partial.pinyin ?? 'p',
    context: partial.context ?? 'c',
    stage: partial.stage ?? 'new',
    learningStep: 0,
    intervalDays: partial.intervalDays ?? 0,
    ease: 2.5,
    dueAt: partial.dueAt ?? NOW,
    reps: 0,
    lapses: 0,
    deckId: partial.deckId,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

describe('computeUnlocked', () => {
  function emptyStats(): AchievementStats {
    return {
      totalReviews: 0,
      matureCount: 0,
      streakCurrent: 0,
      streakLongest: 0,
      decksLoaded: 0,
      completedDeckIds: [],
    };
  }

  it('returns empty set for zero stats', () => {
    expect(computeUnlocked(emptyStats()).size).toBe(0);
  });

  it('unlocks the first-review badge at totalReviews=1', () => {
    const unlocked = computeUnlocked({ ...emptyStats(), totalReviews: 1 });
    expect(unlocked.has('reviews-1')).toBe(true);
    expect(unlocked.has('reviews-10')).toBe(false);
  });

  it('unlocks every reviews tier at or below the count', () => {
    const unlocked = computeUnlocked({ ...emptyStats(), totalReviews: 100 });
    expect(unlocked.has('reviews-1')).toBe(true);
    expect(unlocked.has('reviews-10')).toBe(true);
    expect(unlocked.has('reviews-50')).toBe(true);
    expect(unlocked.has('reviews-100')).toBe(true);
    expect(unlocked.has('reviews-500')).toBe(false);
  });

  it('streak achievement unlocks against the larger of current/longest', () => {
    const unlocked = computeUnlocked({
      ...emptyStats(),
      streakCurrent: 0,
      streakLongest: 30,
    });
    expect(unlocked.has('streak-7')).toBe(true);
    expect(unlocked.has('streak-30')).toBe(true);
    expect(unlocked.has('streak-100')).toBe(false);
  });

  it('hsk-N-done unlocks when its deck id appears in completedDeckIds', () => {
    const unlocked = computeUnlocked({
      ...emptyStats(),
      completedDeckIds: ['hsk-1', 'hsk-3'],
    });
    expect(unlocked.has('hsk-1-done')).toBe(true);
    expect(unlocked.has('hsk-2-done')).toBe(false);
    expect(unlocked.has('hsk-3-done')).toBe(true);
  });

  it('all achievement ids are unique', () => {
    const ids = ACHIEVEMENTS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('gatherAchievementStats', () => {
  beforeEach(async () => {
    await clearAll();
    await db.reviews.clear();
  });

  it('counts reviews and matures from Dexie', async () => {
    await db.cards.bulkAdd([
      makeCard({ id: '1', word: 'a', stage: 'mature' }),
      makeCard({ id: '2', word: 'b', stage: 'mature' }),
      makeCard({ id: '3', word: 'c', stage: 'new' }),
    ]);
    for (let i = 0; i < 3; i++) {
      await logReview({
        cardId: '1',
        rating: 'good',
        reviewedAt: NOW,
        stageBefore: 'new',
        stageAfter: 'mature',
        intervalDaysBefore: 0,
        intervalDaysAfter: 21,
        easeBefore: 2.5,
        easeAfter: 2.5,
      });
    }

    const s = await gatherAchievementStats(NOW);
    expect(s.totalReviews).toBe(3);
    expect(s.matureCount).toBe(2);
  });

  it('reports a deck as completed when every card in it is mature', async () => {
    await db.cards.bulkAdd([
      makeCard({ id: 'h1-a', word: '一', stage: 'mature', deckId: 'hsk-1' }),
      makeCard({ id: 'h1-b', word: '二', stage: 'mature', deckId: 'hsk-1' }),
      makeCard({ id: 'h2-a', word: '三', stage: 'young', deckId: 'hsk-2' }),
    ]);
    const s = await gatherAchievementStats(NOW);
    expect(s.completedDeckIds).toContain('hsk-1');
    expect(s.completedDeckIds).not.toContain('hsk-2');
    expect(s.decksLoaded).toBe(2);
  });
});
