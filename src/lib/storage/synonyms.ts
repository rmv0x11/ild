import type { SynonymCard, SynonymCsvRow, SynonymDeck } from '@/types/domain';
import { uuid } from '@/lib/uuid';
import { db } from './db';

export interface ImportSynonymDeckParams {
  /** Стабильный id (для пресетов); если не задан — генерируется uuid. */
  deckId?: string;
  name: string;
  rows: SynonymCsvRow[];
  now: number;
}

export async function importSynonymDeck(
  params: ImportSynonymDeckParams,
): Promise<{ deckId: string; added: number; skipped: number }> {
  const { name, rows, now } = params;
  const deckId = params.deckId ?? uuid();
  let added = 0;
  let skipped = 0;

  await db.transaction('rw', db.synonymDecks, db.synonymCards, async () => {
    // Повторный импорт пресета обновляет имя колоды, но сохраняет createdAt.
    const existingDeck = await db.synonymDecks.get(deckId);
    const deck: SynonymDeck = {
      id: deckId,
      name,
      createdAt: existingDeck?.createdAt ?? now,
    };
    await db.synonymDecks.put(deck);

    // Дедупликация по паре word+synonym в пределах этой колоды (включая дубли
    // внутри импортируемого батча): одно слово может встречаться с разными
    // синонимами (爱惜/珍惜 и 爱惜/愛護) — это разные карточки.
    // NUL-разделитель не встречается в тексте карточек.
    const dedupKey = (word: string, synonym: string) => `${word}\u0000${synonym}`;
    const existingPairs = new Set(
      (await db.synonymCards.where('deckId').equals(deckId).toArray()).map((c) =>
        dedupKey(c.word, c.synonym),
      ),
    );

    const newCards: SynonymCard[] = [];
    for (const row of rows) {
      const key = dedupKey(row.word, row.synonym);
      if (existingPairs.has(key)) {
        skipped += 1;
        continue;
      }
      existingPairs.add(key);
      newCards.push({
        id: uuid(),
        word: row.word,
        synonym: row.synonym,
        explanation: row.explanation,
        deckId,
        createdAt: now,
        updatedAt: now,
      });
      added += 1;
    }

    if (newCards.length > 0) {
      await db.synonymCards.bulkAdd(newCards);
    }
  });

  return { deckId, added, skipped };
}

/** Все синонимические колоды, отсортированные по createdAt по возрастанию. */
export async function getSynonymDecks(): Promise<SynonymDeck[]> {
  const decks = await db.synonymDecks.toArray();
  return decks.sort((a, b) => a.createdAt - b.createdAt);
}

export async function getSynonymCards(deckId: string): Promise<SynonymCard[]> {
  return db.synonymCards.where('deckId').equals(deckId).toArray();
}

/** Число карточек в каждой колоде: deckId -> count. */
export async function getSynonymDeckCounts(): Promise<Record<string, number>> {
  const all = await db.synonymCards.toArray();
  const counts: Record<string, number> = {};
  for (const card of all) {
    counts[card.deckId] = (counts[card.deckId] ?? 0) + 1;
  }
  return counts;
}

/** Удаляет колоду и каскадно все её карточки. */
export async function deleteSynonymDeck(deckId: string): Promise<void> {
  await db.transaction('rw', db.synonymDecks, db.synonymCards, async () => {
    await db.synonymCards.where('deckId').equals(deckId).delete();
    await db.synonymDecks.delete(deckId);
  });
}
