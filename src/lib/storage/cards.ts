import type { Card, CardStage, CsvRow, DeckStats, Language } from '@/types/domain';
import { DEFAULT_LANGUAGE } from '@/lib/lang/language';
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
  /** Study language of the imported cards. Defaults to Chinese. */
  lang?: Language;
}

export async function addCards(
  rows: CsvRow[],
  now: number,
  options: AddCardsOptions = {},
): Promise<{ added: number; skipped: number }> {
  const lang = options.lang ?? DEFAULT_LANGUAGE;
  let added = 0;
  let skipped = 0;

  const newCards: Card[] = [];

  await db.transaction('rw', db.cards, async () => {
    for (const row of rows) {
      // Dedupe within the same language only — the identical string could
      // legitimately exist as a different-language card.
      const existing = await db.cards
        .where('word')
        .equals(row.word)
        .and((c) => c.lang === lang)
        .first();
      if (existing) {
        skipped += 1;
        continue;
      }
      const card: Card = {
        id: uuid(),
        lang,
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
  options: { lang?: Language; deckFilter?: string; limit?: number } = {},
): Promise<Card[]> {
  const { lang = DEFAULT_LANGUAGE, deckFilter = DECK_ALL, limit } = options;
  // [lang+dueAt] compound index: dueAt is a non-negative epoch, so [lang, 0]
  // .. [lang, now] captures every due card of this language.
  let due = await db.cards
    .where('[lang+dueAt]')
    .between([lang, 0], [lang, now], true, true)
    .toArray();

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
  lang: Language = DEFAULT_LANGUAGE,
  deckFilter: string = DECK_ALL,
): Promise<Card | undefined> {
  const [first] = await getDueCards(now, { lang, deckFilter, limit: 1 });
  return first;
}

export async function updateCard(card: Card): Promise<void> {
  await db.cards.put(card);
}

export async function getAllCards(
  lang: Language = DEFAULT_LANGUAGE,
  deckFilter: string = DECK_ALL,
): Promise<Card[]> {
  const all = await db.cards.where('lang').equals(lang).toArray();
  if (deckFilter === DECK_ALL) return all;
  return all.filter((c) => matchesDeckFilter(c.deckId, deckFilter));
}

/** Delete cards (and their review logs). Scoped to one language when given,
 *  otherwise wipes everything. */
export async function clearAll(lang?: Language): Promise<void> {
  await db.transaction('rw', db.cards, db.reviews, async () => {
    if (!lang) {
      await db.cards.clear();
      await db.reviews.clear();
      return;
    }
    const ids = (await db.cards.where('lang').equals(lang).primaryKeys()) as string[];
    await db.cards.where('lang').equals(lang).delete();
    if (ids.length > 0) {
      await db.reviews.where('cardId').anyOf(ids).delete();
    }
  });
}

export async function getStats(
  now: number,
  lang: Language = DEFAULT_LANGUAGE,
  deckFilter: string = DECK_ALL,
): Promise<DeckStats> {
  if (deckFilter === DECK_ALL) {
    const stageCount = (stage: CardStage): Promise<number> =>
      db.cards.where('[lang+stage]').equals([lang, stage]).count();
    const dueCount = (until: number): Promise<number> =>
      db.cards.where('[lang+dueAt]').between([lang, 0], [lang, until], true, true).count();

    const [total, newCount, learning, young, mature, relearning, dueNow, dueToday] =
      await Promise.all([
        db.cards.where('lang').equals(lang).count(),
        stageCount('new'),
        stageCount('learning'),
        stageCount('young'),
        stageCount('mature'),
        stageCount('relearning'),
        dueCount(now),
        dueCount(endOfTodayMs(now)),
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
 * build the deck-selector dropdown only with decks the user actually owns.
 * Scoped to one language when given (the selector), unscoped for global
 * checks like achievements. */
export async function getKnownDeckIds(lang?: Language): Promise<string[]> {
  const ids = new Set<string>();
  const collection = lang ? db.cards.where('lang').equals(lang) : db.cards.toCollection();
  await collection.each((c) => {
    if (typeof c.deckId === 'string' && c.deckId.length > 0) {
      ids.add(c.deckId);
    }
  });
  return Array.from(ids).sort();
}
