import { beforeEach, describe, expect, it } from 'vitest';
import type { Card, ReviewLog } from '@/types/domain';
import { db } from '@/lib/storage/db';
import { clearAll } from '@/lib/storage/cards';
import { deleteCard, resetCardProgress, updateCardFields } from './cardActions';

function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    id: 'c-1',
    word: '你好',
    pinyin: 'nǐ hǎo',
    context: 'hello',
    stage: 'mature',
    learningStep: 0,
    intervalDays: 30,
    ease: 2.7,
    dueAt: 1_700_000_000_000,
    reps: 5,
    lapses: 1,
    createdAt: 1_000,
    updatedAt: 1_000,
    ...overrides,
  };
}

function makeReview(overrides: Partial<ReviewLog> = {}): Omit<ReviewLog, 'id'> {
  return {
    cardId: 'c-1',
    rating: 'good',
    reviewedAt: 2_000,
    stageBefore: 'new',
    stageAfter: 'learning',
    intervalDaysBefore: 0,
    intervalDaysAfter: 0,
    easeBefore: 2.5,
    easeAfter: 2.5,
    ...overrides,
  };
}

describe('cardActions', () => {
  beforeEach(async () => {
    await clearAll();
  });

  describe('resetCardProgress', () => {
    it('resets stage, ease, interval, learning step, reps and lapses', async () => {
      const before = makeCard();
      await db.cards.put(before);

      await resetCardProgress(before.id);

      const after = await db.cards.get(before.id);
      expect(after).toBeDefined();
      expect(after!.stage).toBe('new');
      expect(after!.learningStep).toBe(0);
      expect(after!.intervalDays).toBe(0);
      expect(after!.ease).toBe(2.5);
      expect(after!.reps).toBe(0);
      expect(after!.lapses).toBe(0);
      expect(after!.updatedAt).toBeGreaterThanOrEqual(before.updatedAt);
      // dueAt set to ~now (close to current time)
      expect(after!.dueAt).toBeGreaterThan(before.createdAt);
    });

    it('does not touch word, pinyin or context', async () => {
      const before = makeCard({ word: '老', pinyin: 'lǎo', context: 'old' });
      await db.cards.put(before);

      await resetCardProgress(before.id);

      const after = await db.cards.get(before.id);
      expect(after!.word).toBe('老');
      expect(after!.pinyin).toBe('lǎo');
      expect(after!.context).toBe('old');
    });
  });

  describe('deleteCard', () => {
    it('removes the card and all its reviews', async () => {
      await db.cards.put(makeCard({ id: 'a' }));
      await db.cards.put(makeCard({ id: 'b', word: 'other' }));
      await db.reviews.add(makeReview({ cardId: 'a' }) as ReviewLog);
      await db.reviews.add(makeReview({ cardId: 'a', reviewedAt: 3_000 }) as ReviewLog);
      await db.reviews.add(makeReview({ cardId: 'b' }) as ReviewLog);

      await deleteCard('a');

      expect(await db.cards.get('a')).toBeUndefined();
      // other card is untouched
      expect(await db.cards.get('b')).toBeDefined();
      // its reviews are gone
      const remaining = await db.reviews.toArray();
      expect(remaining).toHaveLength(1);
      expect(remaining[0].cardId).toBe('b');
    });

    it('is a no-op when the card does not exist', async () => {
      await expect(deleteCard('missing')).resolves.toBeUndefined();
    });
  });

  describe('updateCardFields', () => {
    it('updates pinyin/context and bumps updatedAt', async () => {
      const before = makeCard({ updatedAt: 1_000 });
      await db.cards.put(before);

      const t0 = Date.now();
      await updateCardFields(before.id, { pinyin: 'NEW_PINYIN', context: 'NEW_CTX' });

      const after = await db.cards.get(before.id);
      expect(after!.pinyin).toBe('NEW_PINYIN');
      expect(after!.context).toBe('NEW_CTX');
      expect(after!.word).toBe(before.word);
      expect(after!.updatedAt).toBeGreaterThanOrEqual(t0);
      // SM-2 state is untouched
      expect(after!.stage).toBe(before.stage);
      expect(after!.ease).toBe(before.ease);
      expect(after!.intervalDays).toBe(before.intervalDays);
    });

    it('can update word', async () => {
      const before = makeCard();
      await db.cards.put(before);

      await updateCardFields(before.id, { word: '再见' });

      const after = await db.cards.get(before.id);
      expect(after!.word).toBe('再见');
    });
  });
});
