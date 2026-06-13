// Full-database backup / restore — the cheap safety net against IndexedDB
// eviction (iOS WebKit can clear IndexedDB under storage pressure and does NOT
// honor navigator.storage.persist() as a hard guarantee). The user can export
// their whole collection to a single JSON file and restore it later or on
// another device.
//
// We back up the four user-data tables. `meta` is intentionally excluded — it
// only holds sync watermarks, which must not be carried across a restore (a
// stale cursor would corrupt a later sync). Pure storage + serialization here;
// the DOM download / native file-save glue lives in the UI / native layer.

import type { Card, ReviewLog, SynonymCard, SynonymDeck } from '@/types/domain';
import { db } from './db';

export const BACKUP_VERSION = 1;

export interface BackupCounts {
  cards: number;
  reviews: number;
  synonymDecks: number;
  synonymCards: number;
}

export interface BackupFile {
  app: 'ild';
  kind: 'backup';
  version: typeof BACKUP_VERSION;
  /** Epoch ms when the backup was taken (passed in — no Date.now in lib code). */
  exportedAt: number;
  counts: BackupCounts;
  data: {
    cards: Card[];
    reviews: ReviewLog[];
    synonymDecks: SynonymDeck[];
    synonymCards: SynonymCard[];
  };
}

/** 'replace' wipes the DB and installs the backup; 'merge' upserts by id. */
export type RestoreMode = 'replace' | 'merge';

export type RestoreResult = BackupCounts;

/** Read every user-data table into a self-describing backup object. */
export async function createBackup(now: number): Promise<BackupFile> {
  const [cards, reviews, synonymDecks, synonymCards] = await Promise.all([
    db.cards.toArray(),
    db.reviews.toArray(),
    db.synonymDecks.toArray(),
    db.synonymCards.toArray(),
  ]);
  return {
    app: 'ild',
    kind: 'backup',
    version: BACKUP_VERSION,
    exportedAt: now,
    counts: {
      cards: cards.length,
      reviews: reviews.length,
      synonymDecks: synonymDecks.length,
      synonymCards: synonymCards.length,
    },
    data: { cards, reviews, synonymDecks, synonymCards },
  };
}

export function serializeBackup(backup: BackupFile): string {
  return JSON.stringify(backup, null, 2);
}

/** Suggested filename, e.g. "ild-backup-2026-06-13.json". */
export function backupFilename(now: number): string {
  const date = new Date(now).toISOString().slice(0, 10);
  return `ild-backup-${date}.json`;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isBackupFile(value: unknown): value is BackupFile {
  if (!isObject(value)) return false;
  if (value.app !== 'ild' || value.kind !== 'backup') return false;
  if (value.version !== BACKUP_VERSION) return false;
  if (!isObject(value.data)) return false;
  const d = value.data;
  return (
    Array.isArray(d.cards) &&
    Array.isArray(d.reviews) &&
    Array.isArray(d.synonymDecks) &&
    Array.isArray(d.synonymCards)
  );
}

/**
 * Parse + validate a backup file's text. Throws a user-facing Error (Russian,
 * matching the app's UI language) when the input is not a valid ild backup.
 */
export function parseBackup(text: string): BackupFile {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('Файл повреждён: не удалось разобрать JSON.');
  }
  if (isObject(raw) && raw.app === 'ild' && raw.kind === 'backup' && raw.version !== BACKUP_VERSION) {
    throw new Error(
      `Несовместимая версия резервной копии (${String(raw.version)}). Ожидалась версия ${BACKUP_VERSION}.`,
    );
  }
  if (!isBackupFile(raw)) {
    throw new Error('Это не похоже на файл резервной копии ild.');
  }
  return raw;
}

/**
 * Restore a backup into IndexedDB.
 *
 * - 'replace' clears the four user tables and installs the backup verbatim
 *   (preserving review-log ids) — the honest "restore my database" path.
 * - 'merge' upserts the id-keyed tables (cards, synonym decks/cards) and
 *   APPENDS reviews with fresh ids so it never clobbers existing review rows.
 *   Merging the same file twice will duplicate review-log entries — replace is
 *   the clean path for a true restore.
 */
export async function restoreBackup(backup: BackupFile, mode: RestoreMode): Promise<RestoreResult> {
  const { cards, reviews, synonymDecks, synonymCards } = backup.data;

  await db.transaction(
    'rw',
    db.cards,
    db.reviews,
    db.synonymDecks,
    db.synonymCards,
    async () => {
      if (mode === 'replace') {
        await Promise.all([
          db.cards.clear(),
          db.reviews.clear(),
          db.synonymDecks.clear(),
          db.synonymCards.clear(),
        ]);
        if (cards.length) await db.cards.bulkAdd(cards);
        if (reviews.length) await db.reviews.bulkAdd(reviews);
        if (synonymDecks.length) await db.synonymDecks.bulkAdd(synonymDecks);
        if (synonymCards.length) await db.synonymCards.bulkAdd(synonymCards);
      } else {
        if (cards.length) await db.cards.bulkPut(cards);
        if (synonymDecks.length) await db.synonymDecks.bulkPut(synonymDecks);
        if (synonymCards.length) await db.synonymCards.bulkPut(synonymCards);
        if (reviews.length) {
          // Drop the original ids so the append-only log gets fresh keys.
          await db.reviews.bulkAdd(reviews.map(({ id: _id, ...rest }) => rest));
        }
      }
    },
  );

  return {
    cards: cards.length,
    reviews: reviews.length,
    synonymDecks: synonymDecks.length,
    synonymCards: synonymCards.length,
  };
}
