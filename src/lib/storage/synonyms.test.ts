import { beforeEach, describe, expect, it } from 'vitest';
import type { SynonymCsvRow } from '@/types/domain';
import { db } from './db';
import {
  deleteSynonymDeck,
  getSynonymCards,
  getSynonymDeckCounts,
  getSynonymDecks,
  importSynonymDeck,
} from './synonyms';

const NOW = 1_700_000_000_000;

const rows: SynonymCsvRow[] = [
  { word: '高兴', synonym: '开心', explanation: '高兴 — нейтральное, 开心 — разговорное' },
  { word: '突然', synonym: '忽然', explanation: '突然 может быть прилагательным' },
];

describe('synonyms repository', () => {
  beforeEach(async () => {
    await db.synonymCards.clear();
    await db.synonymDecks.clear();
  });

  it('imports a deck and returns deckId/added/skipped', async () => {
    const result = await importSynonymDeck({ name: 'Моя колода', rows, now: NOW });
    expect(result.added).toBe(2);
    expect(result.skipped).toBe(0);
    expect(result.deckId).toBeTruthy();

    const decks = await getSynonymDecks();
    expect(decks).toHaveLength(1);
    expect(decks[0]).toEqual({ id: result.deckId, name: 'Моя колода', createdAt: NOW });

    const cards = await getSynonymCards(result.deckId);
    expect(cards).toHaveLength(2);
    expect(cards.every((c) => c.deckId === result.deckId)).toBe(true);
    expect(cards.every((c) => c.createdAt === NOW && c.updatedAt === NOW)).toBe(true);
    const byWord = new Map(cards.map((c) => [c.word, c]));
    expect(byWord.get('高兴')?.synonym).toBe('开心');
    expect(byWord.get('突然')?.explanation).toBe('突然 может быть прилагательным');
  });

  it('skips rows whose word+synonym pair already exists in the same deck', async () => {
    const first = await importSynonymDeck({ deckId: 'syn-test', name: 'X', rows, now: NOW });
    expect(first).toEqual({ deckId: 'syn-test', added: 2, skipped: 0 });

    const second = await importSynonymDeck({
      deckId: 'syn-test',
      name: 'X',
      rows: [
        rows[0],
        { word: '快乐', synonym: '愉快', explanation: '快乐 — про состояние счастья' },
      ],
      now: NOW + 1000,
    });
    expect(second).toEqual({ deckId: 'syn-test', added: 1, skipped: 1 });
    expect(await getSynonymCards('syn-test')).toHaveLength(3);
  });

  it('imports both rows when the word repeats with different synonyms', async () => {
    const result = await importSynonymDeck({
      deckId: 'syn-pairs',
      name: 'Пары',
      rows: [
        { word: '爱惜', synonym: '珍惜', explanation: '珍惜 — дорожить (временем, шансом)' },
        { word: '爱惜', synonym: '愛護', explanation: '愛護 — беречь, заботиться' },
      ],
      now: NOW,
    });
    expect(result).toEqual({ deckId: 'syn-pairs', added: 2, skipped: 0 });

    const cards = await getSynonymCards('syn-pairs');
    expect(cards).toHaveLength(2);
    expect(cards.map((c) => c.synonym).sort()).toEqual(['愛護', '珍惜']);
    expect(cards.every((c) => c.word === '爱惜')).toBe(true);
  });

  it('skips an exact word+synonym duplicate inside a single import batch', async () => {
    const result = await importSynonymDeck({
      deckId: 'syn-batch',
      name: 'Батч',
      rows: [rows[0], rows[0], rows[1]],
      now: NOW,
    });
    expect(result).toEqual({ deckId: 'syn-batch', added: 2, skipped: 1 });
    expect(await getSynonymCards('syn-batch')).toHaveLength(2);
  });

  it('same word with a new synonym is added on re-import into an existing deck', async () => {
    await importSynonymDeck({ deckId: 'syn-grow', name: 'X', rows: [rows[0]], now: NOW });
    const second = await importSynonymDeck({
      deckId: 'syn-grow',
      name: 'X',
      rows: [{ word: rows[0].word, synonym: '快乐', explanation: 'другой оттенок' }],
      now: NOW + 1000,
    });
    expect(second).toEqual({ deckId: 'syn-grow', added: 1, skipped: 0 });
    expect(await getSynonymCards('syn-grow')).toHaveLength(2);
  });

  it('allows the same word in different decks', async () => {
    await importSynonymDeck({ deckId: 'a', name: 'A', rows, now: NOW });
    const result = await importSynonymDeck({ deckId: 'b', name: 'B', rows, now: NOW + 1 });
    expect(result.added).toBe(2);
    expect(result.skipped).toBe(0);
  });

  it('re-importing a preset does not duplicate cards, updates the name and keeps createdAt', async () => {
    await importSynonymDeck({ deckId: 'syn-hsk', name: 'Старое имя', rows, now: NOW });
    const again = await importSynonymDeck({
      deckId: 'syn-hsk',
      name: 'Новое имя',
      rows,
      now: NOW + 5000,
    });
    expect(again).toEqual({ deckId: 'syn-hsk', added: 0, skipped: 2 });

    const decks = await getSynonymDecks();
    expect(decks).toHaveLength(1);
    expect(decks[0].name).toBe('Новое имя');
    expect(decks[0].createdAt).toBe(NOW); // createdAt от первоначального импорта
    expect(await getSynonymCards('syn-hsk')).toHaveLength(2);
  });

  it('getSynonymDecks returns decks sorted by createdAt ascending', async () => {
    await importSynonymDeck({ deckId: 'later', name: 'Поздняя', rows: [], now: NOW + 9000 });
    await importSynonymDeck({ deckId: 'earlier', name: 'Ранняя', rows: [], now: NOW });
    const decks = await getSynonymDecks();
    expect(decks.map((d) => d.id)).toEqual(['earlier', 'later']);
  });

  it('getSynonymDeckCounts groups card counts by deckId', async () => {
    await importSynonymDeck({ deckId: 'a', name: 'A', rows, now: NOW });
    await importSynonymDeck({ deckId: 'b', name: 'B', rows: [rows[0]], now: NOW });
    await importSynonymDeck({ deckId: 'empty', name: 'Пустая', rows: [], now: NOW });

    const counts = await getSynonymDeckCounts();
    expect(counts).toEqual({ a: 2, b: 1 }); // пустая колода в counts не попадает
  });

  it('deleteSynonymDeck removes the deck and cascades to its cards', async () => {
    await importSynonymDeck({ deckId: 'a', name: 'A', rows, now: NOW });
    await importSynonymDeck({ deckId: 'b', name: 'B', rows, now: NOW + 1 });

    await deleteSynonymDeck('a');

    expect(await getSynonymDecks()).toHaveLength(1);
    expect(await getSynonymCards('a')).toHaveLength(0);
    expect(await db.synonymCards.count()).toBe(2); // карточки другой колоды не тронуты
    expect(await getSynonymCards('b')).toHaveLength(2);
  });

  it('importSynonymDeck without deckId generates a unique id', async () => {
    const first = await importSynonymDeck({ name: 'A', rows: [], now: NOW });
    const second = await importSynonymDeck({ name: 'B', rows: [], now: NOW });
    expect(first.deckId).not.toBe(second.deckId);
    expect(await getSynonymDecks()).toHaveLength(2);
  });
});
