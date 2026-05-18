import type { ReviewLog } from '@/types/domain';
import { db } from './db';

export async function logReview(log: Omit<ReviewLog, 'id'>): Promise<void> {
  await db.reviews.add(log as ReviewLog);
}

export async function getReviewsFor(cardId: string): Promise<ReviewLog[]> {
  return db.reviews.where('cardId').equals(cardId).sortBy('reviewedAt');
}
