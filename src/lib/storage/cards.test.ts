import { beforeEach, describe, expect, it } from 'vitest';
import type { Card, CsvRow } from '@/types/domain';
import { db } from './db';
import {
  addCards,
  clearAll,
  getAllCards,
  getDueCards,
  getNextDueCard,
  getStats,
  updateCard,
} from './cards';

const NOW = 1_700_000_000_000;

const rows: CsvRow[] = [
  { word: '你好', pinyin: 'nǐ hǎo', context: '**你好** контекст' },
  { word: '谢谢', pinyin: 'xiè xie', context: '**谢谢** контекст' },
];

describe('cards repository', () => {
  beforeEach(async () => {
    await clearAll();
  });

  it('adds new cards and returns added/skipped counts', async () => {
    const result = await addCards(rows, NOW);
    expect(result).toEqual({ added: 2, skipped: 0 });
    const all = await getAllCards();
    expect(all).toHaveLength(2);
    expect(all.every((c) => c.stage === 'new')).toBe(true);
    expect(all.every((c) => c.ease === 2.5)).toBe(true);
    expect(all.every((c) => c.intervalDays === 0)).toBe(true);
    expect(all.every((c) => c.dueAt === NOW)).toBe(true);
    expect(all.every((c) => c.createdAt === NOW && c.updatedAt === NOW)).toBe(true);
  });

  it('skips cards whose word already exists', async () => {
    await addCards(rows, NOW);
    const second = await addCards(rows, NOW + 1000);
    expect(second).toEqual({ added: 0, skipped: 2 });
    const all = await getAllCards();
    expect(all).toHaveLength(2);
  });

  it('returns only cards whose dueAt is at or before now from getDueCards', async () => {
    await addCards(rows, NOW);
    const all = await getAllCards();
    // push the second card into the future
    const [first, second] = all;
    await updateCard({ ...second, dueAt: NOW + 60_000 });

    const due = await getDueCards(NOW);
    expect(due).toHaveLength(1);
    expect(due[0].id).toBe(first.id);

    const next = await getNextDueCard(NOW);
    expect(next?.id).toBe(first.id);
  });

  it('respects the limit argument', async () => {
    await addCards(rows, NOW);
    const due = await getDueCards(NOW, 1);
    expect(due).toHaveLength(1);
  });

  it('orders due cards by stage priority then by dueAt', async () => {
    const base: Omit<Card, 'id' | 'stage' | 'word'> = {
      pinyin: 'p',
      context: 'c',
      learningStep: 0,
      intervalDays: 0,
      ease: 2.5,
      dueAt: NOW,
      reps: 0,
      lapses: 0,
      createdAt: NOW,
      updatedAt: NOW,
    };

    const cards: Card[] = [
      { ...base, id: 'mat', stage: 'mature', word: 'm' },
      { ...base, id: 'new', stage: 'new', word: 'n' },
      { ...base, id: 'young', stage: 'young', word: 'y' },
      { ...base, id: 'rel', stage: 'relearning', word: 'r' },
      { ...base, id: 'lrn', stage: 'learning', word: 'l' },
    ];
    await db.cards.bulkAdd(cards);

    const due = await getDueCards(NOW);
    const stages = due.map((c) => c.stage);
    // learning and relearning come first (priority 0), then young, then new, then mature
    expect(stages.slice(0, 2).sort()).toEqual(['learning', 'relearning']);
    expect(stages[2]).toBe('young');
    expect(stages[3]).toBe('new');
    expect(stages[4]).toBe('mature');
  });

  it('orders by dueAt asc within the same stage', async () => {
    const base: Omit<Card, 'id' | 'dueAt' | 'word'> = {
      pinyin: 'p',
      context: 'c',
      stage: 'young',
      learningStep: 0,
      intervalDays: 1,
      ease: 2.5,
      reps: 1,
      lapses: 0,
      createdAt: NOW,
      updatedAt: NOW,
    };
    await db.cards.bulkAdd([
      { ...base, id: 'a', dueAt: NOW - 1000, word: 'a' },
      { ...base, id: 'b', dueAt: NOW - 5000, word: 'b' },
      { ...base, id: 'c', dueAt: NOW - 100, word: 'c' },
    ]);
    const due = await getDueCards(NOW);
    expect(due.map((c) => c.id)).toEqual(['b', 'a', 'c']);
  });

  it('computes stats correctly per stage', async () => {
    const base: Omit<Card, 'id' | 'stage' | 'word' | 'dueAt'> = {
      pinyin: 'p',
      context: 'c',
      learningStep: 0,
      intervalDays: 0,
      ease: 2.5,
      reps: 0,
      lapses: 0,
      createdAt: NOW,
      updatedAt: NOW,
    };
    await db.cards.bulkAdd([
      { ...base, id: '1', stage: 'new', word: 'a', dueAt: NOW },
      { ...base, id: '2', stage: 'new', word: 'b', dueAt: NOW },
      { ...base, id: '3', stage: 'learning', word: 'c', dueAt: NOW },
      { ...base, id: '4', stage: 'young', word: 'd', dueAt: NOW + 60 * 60 * 1000 },
      { ...base, id: '5', stage: 'mature', word: 'e', dueAt: NOW + 10 * 24 * 60 * 60 * 1000 },
      { ...base, id: '6', stage: 'relearning', word: 'f', dueAt: NOW },
    ]);

    const stats = await getStats(NOW);
    expect(stats.total).toBe(6);
    expect(stats.new).toBe(2);
    expect(stats.learning).toBe(1);
    expect(stats.young).toBe(1);
    expect(stats.mature).toBe(1);
    expect(stats.relearning).toBe(1);
    expect(stats.dueNow).toBe(4); // 2 new + 1 learning + 1 relearning
    // dueToday should include "young" card that is due in 1 hour (still today)
    // but not the "mature" card 10 days away
    expect(stats.dueToday).toBeGreaterThanOrEqual(4);
    expect(stats.dueToday).toBeLessThanOrEqual(5);
  });

  it('clearAll removes cards and reviews', async () => {
    await addCards(rows, NOW);
    await db.reviews.add({
      cardId: 'x',
      rating: 'good',
      reviewedAt: NOW,
      stageBefore: 'new',
      stageAfter: 'learning',
      intervalDaysBefore: 0,
      intervalDaysAfter: 0,
      easeBefore: 2.5,
      easeAfter: 2.5,
    });

    await clearAll();
    expect(await db.cards.count()).toBe(0);
    expect(await db.reviews.count()).toBe(0);
  });
});
