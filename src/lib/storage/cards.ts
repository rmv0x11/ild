import type { Card, CardStage, CsvRow, DeckStats } from '@/types/domain';
import { uuid } from '@/lib/uuid';
import { db } from './db';

function endOfTodayMs(now: number): number {
  const d = new Date(now);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

const STAGE_PRIORITY: Record<CardStage, number> = {
  learning: 0,
  relearning: 0,
  young: 1,
  new: 2,
  mature: 3,
};

export async function addCards(
  rows: CsvRow[],
  now: number,
): Promise<{ added: number; skipped: number }> {
  let added = 0;
  let skipped = 0;

  const newCards: Card[] = [];

  await db.transaction('rw', db.cards, async () => {
    for (const row of rows) {
      const existing = await db.cards.where('word').equals(row.word).first();
      if (existing) {
        skipped += 1;
        continue;
      }
      const card: Card = {
        id: uuid(),
        word: row.word,
        pinyin: row.pinyin,
        context: row.context,
        stage: 'new',
        learningStep: 0,
        intervalDays: 0,
        ease: 2.5,
        dueAt: now,
        reps: 0,
        lapses: 0,
        createdAt: now,
        updatedAt: now,
      };
      newCards.push(card);
      added += 1;
    }

    if (newCards.length > 0) {
      await db.cards.bulkAdd(newCards);
    }
  });

  return { added, skipped };
}

export async function getDueCards(now: number, limit?: number): Promise<Card[]> {
  const due = await db.cards.where('dueAt').belowOrEqual(now).toArray();

  due.sort((a, b) => {
    const pa = STAGE_PRIORITY[a.stage];
    const pb = STAGE_PRIORITY[b.stage];
    if (pa !== pb) return pa - pb;
    return a.dueAt - b.dueAt;
  });

  if (typeof limit === 'number') {
    return due.slice(0, limit);
  }
  return due;
}

export async function getNextDueCard(now: number): Promise<Card | undefined> {
  const [first] = await getDueCards(now, 1);
  return first;
}

export async function updateCard(card: Card): Promise<void> {
  await db.cards.put(card);
}

export async function getAllCards(): Promise<Card[]> {
  return db.cards.toArray();
}

export async function clearAll(): Promise<void> {
  await db.transaction('rw', db.cards, db.reviews, async () => {
    await db.cards.clear();
    await db.reviews.clear();
  });
}

export async function getStats(now: number): Promise<DeckStats> {
  const [total, newCount, learning, young, mature, relearning, dueNow, dueToday] = await Promise.all([
    db.cards.count(),
    db.cards.where('stage').equals('new').count(),
    db.cards.where('stage').equals('learning').count(),
    db.cards.where('stage').equals('young').count(),
    db.cards.where('stage').equals('mature').count(),
    db.cards.where('stage').equals('relearning').count(),
    db.cards.where('dueAt').belowOrEqual(now).count(),
    db.cards.where('dueAt').belowOrEqual(endOfTodayMs(now)).count(),
  ]);

  return {
    total,
    new: newCount,
    learning,
    young,
    mature,
    relearning,
    dueNow,
    dueToday,
  };
}
