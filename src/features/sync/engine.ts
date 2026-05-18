import { db } from '@/lib/storage/db';
import { ApiError } from '@/lib/api/client';
import type { Card, ReviewLog } from '@/types/domain';
import {
  pullCards as apiPullCards,
  pushCards as apiPushCards,
  pullReviews as apiPullReviews,
  pushReviews as apiPushReviews,
} from './api';
import { getWatermark, setWatermark, setMeta, META_KEYS } from './meta';
import type { CardWire, ReviewWire } from './types';

const DEFAULT_PULL_LIMIT = 500;
const DEFAULT_PUSH_BATCH = 500;
const MAX_PULL_ITERATIONS = 1000;

export class SyncUnauthorizedError extends Error {
  constructor() {
    super('sync: unauthorized');
    this.name = 'SyncUnauthorizedError';
  }
}

function isUnauthorized(err: unknown): boolean {
  return err instanceof ApiError && err.status === 401;
}

/**
 * Pull cards from server with cursor-based pagination.
 * LWW merge: server tombstones delete locally; non-tombstones overwrite
 * only when local copy is missing or older than the server copy.
 */
async function pullAllCards(): Promise<number> {
  let since = await getWatermark(META_KEYS.cardsLastPulled);
  let pulled = 0;
  let iterations = 0;

  // Drain until the server reports no progress.
  while (iterations < MAX_PULL_ITERATIONS) {
    iterations += 1;
    const { cards, nextSince } = await apiPullCards(since, DEFAULT_PULL_LIMIT);

    if (cards.length > 0) {
      await applyPulledCards(cards);
      pulled += cards.length;
    }

    if (nextSince <= since) {
      // No further progress — done.
      break;
    }
    since = nextSince;
    await setWatermark(META_KEYS.cardsLastPulled, since);

    if (cards.length < DEFAULT_PULL_LIMIT) {
      // Short page — server has no more data right now.
      break;
    }
  }

  return pulled;
}

async function applyPulledCards(cards: CardWire[]): Promise<void> {
  if (cards.length === 0) return;
  const ids = cards.map((c) => c.id);
  await db.transaction('rw', db.cards, async () => {
    const existing = await db.cards.bulkGet(ids);
    const existingById = new Map<string, Card>();
    existing.forEach((c, idx) => {
      if (c) existingById.set(ids[idx], c);
    });

    const toPut: Card[] = [];
    const toDelete: string[] = [];

    for (const remote of cards) {
      if (remote.deletedAt !== undefined && remote.deletedAt !== null) {
        // Tombstone: drop locally regardless of LWW (server is source of truth on deletes).
        toDelete.push(remote.id);
        continue;
      }

      const local = existingById.get(remote.id);
      if (local && local.updatedAt >= remote.updatedAt) {
        // Local copy is newer or equal — skip overwrite.
        continue;
      }

      // Strip wire-only fields before persisting to local Card store.
      const { deletedAt: _deletedAt, ...rest } = remote;
      toPut.push(rest as Card);
    }

    if (toPut.length > 0) {
      await db.cards.bulkPut(toPut);
    }
    if (toDelete.length > 0) {
      await db.cards.bulkDelete(toDelete);
    }
  });
}

/**
 * Pull reviews — append-only. Reviews from server are unconditionally upserted.
 */
async function pullAllReviews(): Promise<number> {
  let since = await getWatermark(META_KEYS.reviewsLastPulled);
  let pulled = 0;
  let iterations = 0;

  while (iterations < MAX_PULL_ITERATIONS) {
    iterations += 1;
    const { reviews, nextSince } = await apiPullReviews(since, DEFAULT_PULL_LIMIT);

    if (reviews.length > 0) {
      await db.reviews.bulkPut(reviews as ReviewLog[]);
      pulled += reviews.length;
    }

    if (nextSince <= since) {
      break;
    }
    since = nextSince;
    await setWatermark(META_KEYS.reviewsLastPulled, since);

    if (reviews.length < DEFAULT_PULL_LIMIT) {
      break;
    }
  }

  return pulled;
}

export async function pull(): Promise<{ cardsPulled: number; reviewsPulled: number }> {
  const cardsPulled = await pullAllCards();
  const reviewsPulled = await pullAllReviews();
  return { cardsPulled, reviewsPulled };
}

/**
 * Push local changes to the server in batches.
 * Selection: cards with updatedAt > watermark.
 * Watermark advances to max(updatedAt) of pushed batch only on success.
 */
async function pushAllCards(): Promise<number> {
  const since = await getWatermark(META_KEYS.cardsLastPushed);
  // `updatedAt` is not part of the Dexie index schema (see storage/db.ts),
  // so we read all rows and filter in-memory. For a personal Anki-style deck
  // this is fine — the table size is bounded by what one user creates.
  const all = await db.cards.toArray();
  const dirty = all.filter((c) => c.updatedAt > since);
  if (dirty.length === 0) return 0;

  // Stable order by updatedAt so partial failure leaves a coherent watermark.
  dirty.sort((a, b) => a.updatedAt - b.updatedAt);

  let pushed = 0;
  for (let i = 0; i < dirty.length; i += DEFAULT_PUSH_BATCH) {
    const batch = dirty.slice(i, i + DEFAULT_PUSH_BATCH);
    const wire: CardWire[] = batch.map((c) => ({ ...c }));
    await apiPushCards(wire);
    const maxUpdatedAt = batch.reduce((m, c) => (c.updatedAt > m ? c.updatedAt : m), since);
    await setWatermark(META_KEYS.cardsLastPushed, maxUpdatedAt);
    pushed += batch.length;
  }
  return pushed;
}

async function pushAllReviews(): Promise<number> {
  const since = await getWatermark(META_KEYS.reviewsLastPushed);
  // `reviewedAt` IS indexed (`'++id, cardId, reviewedAt'`) — use the index.
  const dirty = await db.reviews.where('reviewedAt').above(since).toArray();
  if (dirty.length === 0) return 0;

  dirty.sort((a, b) => a.reviewedAt - b.reviewedAt);

  let pushed = 0;
  for (let i = 0; i < dirty.length; i += DEFAULT_PUSH_BATCH) {
    const batch = dirty.slice(i, i + DEFAULT_PUSH_BATCH);
    const wire: ReviewWire[] = batch.map((r) => ({ ...r }));
    await apiPushReviews(wire);
    const maxReviewedAt = batch.reduce((m, r) => (r.reviewedAt > m ? r.reviewedAt : m), since);
    await setWatermark(META_KEYS.reviewsLastPushed, maxReviewedAt);
    pushed += batch.length;
  }
  return pushed;
}

export async function push(): Promise<{ cardsPushed: number; reviewsPushed: number }> {
  const cardsPushed = await pushAllCards();
  const reviewsPushed = await pushAllReviews();
  return { cardsPushed, reviewsPushed };
}

export async function syncOnce(now: number = Date.now()): Promise<void> {
  try {
    await pull();
    await push();
    await setMeta(META_KEYS.lastFullSync, String(now));
  } catch (err) {
    if (isUnauthorized(err)) {
      throw new SyncUnauthorizedError();
    }
    throw err;
  }
}

/**
 * Periodic sync. Skips when document is hidden or browser reports offline.
 * Returns a stop function.
 */
export function start(intervalMs = 30_000): () => void {
  let stopped = false;
  let inFlight = false;

  const tick = async (): Promise<void> => {
    if (stopped) return;
    if (typeof document !== 'undefined' && document.hidden) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    if (inFlight) return;

    inFlight = true;
    try {
      await syncOnce();
    } catch {
      // Errors are surfaced via useSync; engine.start swallows so the loop survives.
    } finally {
      inFlight = false;
    }
  };

  const handle = setInterval(() => {
    void tick();
  }, intervalMs);

  // Kick off immediately so the first sync doesn't wait an interval.
  void tick();

  return () => {
    stopped = true;
    clearInterval(handle);
  };
}

/** Count of pending items to be pushed — useful for UI badges. */
export async function getPendingCounts(): Promise<{ cards: number; reviews: number }> {
  const [cardsWatermark, reviewsWatermark] = await Promise.all([
    getWatermark(META_KEYS.cardsLastPushed),
    getWatermark(META_KEYS.reviewsLastPushed),
  ]);
  // `updatedAt` is not indexed on cards — walk the table; reviewedAt is.
  const [allCards, reviews] = await Promise.all([
    db.cards.toArray(),
    db.reviews.where('reviewedAt').above(reviewsWatermark).count(),
  ]);
  const cards = allCards.reduce((n, c) => (c.updatedAt > cardsWatermark ? n + 1 : n), 0);
  return { cards, reviews };
}
