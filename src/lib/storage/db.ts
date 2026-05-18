import Dexie, { type EntityTable } from 'dexie';
import type { Card, ReviewLog } from '@/types/domain';

export interface MetaRow {
  key: string;
  value: string;
}

export class IldDatabase extends Dexie {
  cards!: EntityTable<Card, 'id'>;
  reviews!: EntityTable<ReviewLog, 'id'>;
  meta!: EntityTable<MetaRow, 'key'>;

  constructor() {
    super('ild');
    this.version(1).stores({
      cards: 'id, stage, dueAt, [stage+dueAt], word',
      reviews: '++id, cardId, reviewedAt',
      meta: 'key',
    });
  }
}

export const db = new IldDatabase();
