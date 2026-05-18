import type { Card, CardStage, CsvRow, DeckStats } from '@/types/domain';
import { uuid } from '@/lib/uuid';
import { db } from './db';
import { DECK_ALL, matchesDeckFilter } from './deckFilter';

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

export interface AddCardsOptions {
  /** Tag the imported cards with this deck id (preset id). Existing cards
   * matched by `word` are NOT re-tagged — they keep their original deckId. */
  deckId?: string;
}

export async function addCards(
  rows: CsvRow[],
  now: number,
  options: AddCardsOptions = {},
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
        deckId: options.deckId,
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

export async function getDueCards(
  now: number,
  options: { deckFilter?: string; limit?: number } = {},
): Promise<Card[]> {
  const { deckFilter = DECK_ALL, limit } = options;
  let due = await db.cards.where('dueAt').belowOrEqual(now).toArray();

  if (deckFilter !== DECK_ALL) {
    due = due.filter((c) => matchesDeckFilter(c.deckId, deckFilter));
  }

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

export async function getNextDueCard(
  now: number,
  deckFilter: string = DECK_ALL,
): Promise<Card | undefined> {
  const [first] = await getDueCards(now, { deckFilter, limit: 1 });
  return first;
}

export async function updateCard(card: Card): Promise<void> {
  await db.cards.put(card);
}

export async function getAllCards(deckFilter: string = DECK_ALL): Promise<Card[]> {
  const all = await db.cards.toArray();
  if (deckFilter === DECK_ALL) return all;
  return all.filter((c) => matchesDeckFilter(c.deckId, deckFilter));
}

export async function clearAll(): Promise<void> {
  await db.transaction('rw', db.cards, db.reviews, async () => {
    await db.cards.clear();
    await db.reviews.clear();
  });
}

export async function getStats(now: number, deckFilter: string = DECK_ALL): Promise<DeckStats> {
  if (deckFilter === DECK_ALL) {
    const [total, newCount, learning, young, mature, relearning, dueNow, dueToday] =
      await Promise.all([
        db.cards.count(),
        db.cards.where('stage').equals('new').count(),
        db.cards.where('stage').equals('learning').count(),
        db.cards.where('stage').equals('young').count(),
        db.cards.where('stage').equals('mature').count(),
        db.cards.where('stage').equals('relearning').count(),
        db.cards.where('dueAt').belowOrEqual(now).count(),
        db.cards.where('dueAt').belowOrEqual(endOfTodayMs(now)).count(),
      ]);

    return { total, new: newCount, learning, young, mature, relearning, dueNow, dueToday };
  }

  // Deck-filtered path: pull only the deck's cards in one query, then bucket
  // in-memory. The deckId index keeps this cheap even with thousands of cards.
  const cards = await db.cards.where('deckId').equals(deckFilter).toArray();
  const todayEnd = endOfTodayMs(now);
  let newCount = 0;
  let learning = 0;
  let young = 0;
  let mature = 0;
  let relearning = 0;
  let dueNow = 0;
  let dueToday = 0;
  for (const c of cards) {
    switch (c.stage) {
      case 'new':
        newCount += 1;
        break;
      case 'learning':
        learning += 1;
        break;
      case 'young':
        young += 1;
        break;
      case 'mature':
        mature += 1;
        break;
      case 'relearning':
        relearning += 1;
        break;
    }
    if (c.dueAt <= now) dueNow += 1;
    if (c.dueAt <= todayEnd) dueToday += 1;
  }

  return {
    total: cards.length,
    new: newCount,
    learning,
    young,
    mature,
    relearning,
    dueNow,
    dueToday,
  };
}

/** Distinct list of deckIds currently present in the cards table. Used to
 * build the deck-selector dropdown only with decks the user actually owns. */
export async function getKnownDeckIds(): Promise<string[]> {
  const ids = new Set<string>();
  await db.cards.each((c) => {
    if (typeof c.deckId === 'string' && c.deckId.length > 0) {
      ids.add(c.deckId);
    }
  });
  return Array.from(ids).sort();
}
