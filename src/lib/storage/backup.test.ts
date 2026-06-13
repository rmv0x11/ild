import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Card, ReviewLog, SynonymCard, SynonymDeck } from '@/types/domain';
import { db } from './db';
import {
  backupFilename,
  createBackup,
  parseBackup,
  restoreBackup,
  serializeBackup,
} from './backup';

function makeCard(id: string, word: string, overrides: Partial<Card> = {}): Card {
  return {
    id,
    word,
    pinyin: 'pīn',
    context: 'context',
    stage: 'new',
    learningStep: 0,
    intervalDays: 0,
    ease: 2.5,
    dueAt: 1000,
    reps: 0,
    lapses: 0,
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  };
}

function makeReview(cardId: string): ReviewLog {
  return {
    cardId,
    rating: 'good',
    reviewedAt: 2000,
    stageBefore: 'new',
    stageAfter: 'learning',
    intervalDaysBefore: 0,
    intervalDaysAfter: 0,
    easeBefore: 2.5,
    easeAfter: 2.5,
  };
}

function makeSynDeck(id: string): SynonymDeck {
  return { id, name: `deck-${id}`, createdAt: 1000 };
}

function makeSynCard(id: string, deckId: string): SynonymCard {
  return {
    id,
    word: '词',
    synonym: '同义词',
    explanation: 'разница',
    deckId,
    createdAt: 1000,
    updatedAt: 1000,
  };
}

async function clearDb(): Promise<void> {
  await Promise.all([
    db.cards.clear(),
    db.reviews.clear(),
    db.synonymDecks.clear(),
    db.synonymCards.clear(),
  ]);
}

async function seed(): Promise<void> {
  await db.cards.bulkAdd([makeCard('c1', '你好'), makeCard('c2', '谢谢')]);
  await db.reviews.bulkAdd([makeReview('c1'), makeReview('c1')]);
  await db.synonymDecks.bulkAdd([makeSynDeck('d1')]);
  await db.synonymCards.bulkAdd([makeSynCard('s1', 'd1')]);
}

describe('storage/backup', () => {
  beforeEach(clearDb);
  afterEach(clearDb);

  it('createBackup captures every user-data table with counts and version', async () => {
    await seed();
    const backup = await createBackup(123456);

    expect(backup.app).toBe('ild');
    expect(backup.kind).toBe('backup');
    expect(backup.version).toBe(1);
    expect(backup.exportedAt).toBe(123456);
    expect(backup.counts).toEqual({ cards: 2, reviews: 2, synonymDecks: 1, synonymCards: 1 });
    expect(backup.data.cards.map((c) => c.id).sort()).toEqual(['c1', 'c2']);
    expect(backup.data.synonymCards[0].deckId).toBe('d1');
  });

  it('does not back up the meta (sync watermark) table', async () => {
    await db.meta.put({ key: 'cardsLastPushed', value: '999' });
    const backup = await createBackup(1);
    // The backup shape simply has no place for meta — assert the keys.
    expect(Object.keys(backup.data).sort()).toEqual([
      'cards',
      'reviews',
      'synonymCards',
      'synonymDecks',
    ]);
  });

  it('serialize → parse round-trips', async () => {
    await seed();
    const backup = await createBackup(42);
    const restored = parseBackup(serializeBackup(backup));
    expect(restored).toEqual(backup);
  });

  it('parseBackup rejects invalid JSON', () => {
    expect(() => parseBackup('{not json')).toThrow(/JSON/);
  });

  it('parseBackup rejects a non-ild object', () => {
    expect(() => parseBackup(JSON.stringify({ hello: 'world' }))).toThrow(/резервной копии/);
  });

  it('parseBackup rejects an incompatible version', () => {
    const bad = JSON.stringify({ app: 'ild', kind: 'backup', version: 99, data: {} });
    expect(() => parseBackup(bad)).toThrow(/версия/i);
  });

  it('restore replace wipes existing data and installs the backup exactly', async () => {
    await seed();
    const backup = await createBackup(1);

    // Mutate the DB so we can detect a true replace.
    await clearDb();
    await db.cards.bulkAdd([makeCard('zzz', 'leftover')]);
    await db.reviews.bulkAdd([makeReview('zzz')]);

    const result = await restoreBackup(backup, 'replace');
    expect(result).toEqual({ cards: 2, reviews: 2, synonymDecks: 1, synonymCards: 1 });

    const cards = await db.cards.toArray();
    expect(cards.map((c) => c.id).sort()).toEqual(['c1', 'c2']); // leftover gone
    expect(await db.reviews.count()).toBe(2);
    expect(await db.synonymCards.count()).toBe(1);
  });

  it('restore merge upserts cards by id and appends reviews', async () => {
    // Existing DB has c1 (different word) + one unrelated review.
    await db.cards.bulkAdd([makeCard('c1', 'OLD'), makeCard('keep', 'mine')]);
    await db.reviews.bulkAdd([makeReview('keep')]);

    const backup: Parameters<typeof restoreBackup>[0] = {
      app: 'ild',
      kind: 'backup',
      version: 1,
      exportedAt: 1,
      counts: { cards: 1, reviews: 2, synonymDecks: 0, synonymCards: 0 },
      data: {
        cards: [makeCard('c1', 'NEW')],
        reviews: [makeReview('c1'), makeReview('c1')],
        synonymDecks: [],
        synonymCards: [],
      },
    };

    await restoreBackup(backup, 'merge');

    // c1 upserted to NEW, 'keep' untouched.
    expect((await db.cards.get('c1'))?.word).toBe('NEW');
    expect((await db.cards.get('keep'))?.word).toBe('mine');
    // reviews appended (1 existing + 2 from backup), fresh auto-ids.
    expect(await db.reviews.count()).toBe(3);
    const ids = (await db.reviews.toArray()).map((r) => r.id);
    expect(new Set(ids).size).toBe(3); // all distinct, none undefined
    expect(ids.every((id) => typeof id === 'number')).toBe(true);
  });

  it('backupFilename derives an ISO date from the passed timestamp', () => {
    // 2026-06-13T00:00:00Z
    const ts = Date.UTC(2026, 5, 13);
    expect(backupFilename(ts)).toBe('ild-backup-2026-06-13.json');
  });
});
