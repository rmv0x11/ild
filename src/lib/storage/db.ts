import Dexie, { type EntityTable } from 'dexie';
import type { Card, ReviewLog, SynonymCard, SynonymDeck } from '@/types/domain';

export interface MetaRow {
  key: string;
  value: string;
}

export class IldDatabase extends Dexie {
  cards!: EntityTable<Card, 'id'>;
  reviews!: EntityTable<ReviewLog, 'id'>;
  meta!: EntityTable<MetaRow, 'key'>;
  synonymDecks!: EntityTable<SynonymDeck, 'id'>;
  synonymCards!: EntityTable<SynonymCard, 'id'>;

  constructor() {
    super('ild');
    this.version(1).stores({
      cards: 'id, stage, dueAt, [stage+dueAt], word',
      reviews: '++id, cardId, reviewedAt',
      meta: 'key',
    });
    // v2 — indexed deckId so we can filter the review queue by preset/deck
    // without scanning the whole cards table. Existing cards keep deckId
    // undefined (treated as "default / no deck" by the deck filter UI).
    this.version(2).stores({
      cards: 'id, stage, dueAt, [stage+dueAt], word, deckId',
      reviews: '++id, cardId, reviewedAt',
      meta: 'key',
    });
    // v3 — synonym decks: отдельный Quizlet-режим, который не смешивается с
    // SM-2 (cards/reviews/meta не меняются). synonymCards индексируем только по
    // deckId (выборка карточек колоды; дедупликация при импорте идёт сканом
    // карточек колоды по паре word+synonym и индекса не требует).
    this.version(3).stores({
      cards: 'id, stage, dueAt, [stage+dueAt], word, deckId',
      reviews: '++id, cardId, reviewedAt',
      meta: 'key',
      synonymDecks: 'id',
      synonymCards: 'id, deckId',
    });
  }
}

export const db = new IldDatabase();
