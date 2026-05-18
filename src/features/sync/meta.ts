import { db } from '@/lib/storage/db';

export async function getMeta(key: string): Promise<string | null> {
  const row = await db.meta.get(key);
  return row?.value ?? null;
}

export async function setMeta(key: string, value: string): Promise<void> {
  await db.meta.put({ key, value });
}

export async function getWatermark(key: string): Promise<number> {
  const raw = await getMeta(key);
  if (raw === null) return 0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

export async function setWatermark(key: string, value: number): Promise<void> {
  await setMeta(key, String(value));
}

export const META_KEYS = {
  cardsLastPulled: 'sync.cards.lastPulledAt',
  cardsLastPushed: 'sync.cards.lastPushedAt',
  reviewsLastPulled: 'sync.reviews.lastPulledAt',
  reviewsLastPushed: 'sync.reviews.lastPushedAt',
  lastFullSync: 'sync.lastFullSyncAt',
} as const;
