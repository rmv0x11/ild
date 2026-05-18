import { db } from '@/lib/storage/db';

export async function resetCardProgress(id: string): Promise<void> {
  await db.cards.update(id, {
    stage: 'new',
    learningStep: 0,
    intervalDays: 0,
    ease: 2.5,
    dueAt: Date.now(),
    reps: 0,
    lapses: 0,
    updatedAt: Date.now(),
  });
}

export async function deleteCard(id: string): Promise<void> {
  await db.transaction('rw', db.cards, db.reviews, async () => {
    await db.cards.delete(id);
    await db.reviews.where('cardId').equals(id).delete();
  });
}

export interface UpdatableCardFields {
  word?: string;
  pinyin?: string;
  context?: string;
}

export async function updateCardFields(
  id: string,
  fields: UpdatableCardFields,
): Promise<void> {
  await db.cards.update(id, { ...fields, updatedAt: Date.now() });
}
