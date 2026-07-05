import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';

// Proves the v3 → v4 upgrade backfills `lang: 'zh'` on cards created before
// multi-language support, so they keep matching the language-scoped review
// queries instead of silently disappearing. Runs against an isolated DB name
// so it never collides with the app singleton ('ild').

const DB_NAME = 'ild-migration-test';

const V3_STORES = {
  cards: 'id, stage, dueAt, [stage+dueAt], word, deckId',
  reviews: '++id, cardId, reviewedAt',
  meta: 'key',
  synonymDecks: 'id',
  synonymCards: 'id, deckId',
};

const V4_STORES = {
  cards: 'id, stage, dueAt, [stage+dueAt], word, deckId, lang, [lang+stage], [lang+dueAt]',
  reviews: '++id, cardId, reviewedAt',
  meta: 'key',
  synonymDecks: 'id',
  synonymCards: 'id, deckId',
};

const legacyCard = {
  id: 'legacy-1',
  word: '旧',
  pinyin: 'jiù',
  context: '**旧** старая карточка',
  stage: 'young',
  learningStep: 0,
  intervalDays: 5,
  ease: 2.5,
  dueAt: 1,
  reps: 3,
  lapses: 0,
  createdAt: 1,
  updatedAt: 1,
};

afterEach(async () => {
  await Dexie.delete(DB_NAME);
});

describe('v3 → v4 migration', () => {
  it("backfills lang='zh' on pre-existing cards", async () => {
    // Phase 1: a v3 database with a lang-less card (the shipped Chinese-only state).
    const v3 = new Dexie(DB_NAME);
    v3.version(3).stores(V3_STORES);
    await v3.open();
    await v3.table('cards').add(legacyCard);
    v3.close();

    // Phase 2: reopen with the v4 schema + upgrade (mirrors db.ts).
    const v4 = new Dexie(DB_NAME);
    v4.version(3).stores(V3_STORES);
    v4.version(4)
      .stores(V4_STORES)
      .upgrade(async (tx) => {
        await tx
          .table('cards')
          .toCollection()
          .modify((card: { lang?: string }) => {
            if (card.lang === undefined) card.lang = 'zh';
          });
      });
    await v4.open();

    const migrated = await v4.table('cards').get('legacy-1');
    expect(migrated.lang).toBe('zh');
    // The migrated card is now reachable through the [lang+dueAt] compound index.
    const viaIndex = await v4
      .table('cards')
      .where('[lang+dueAt]')
      .between(['zh', 0], ['zh', Number.MAX_SAFE_INTEGER], true, true)
      .toArray();
    expect(viaIndex.map((c) => c.id)).toContain('legacy-1');
    v4.close();
  });
});
