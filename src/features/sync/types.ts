import type { Card, ReviewLog } from '@/types/domain';

export type SyncStatus = 'idle' | 'syncing' | 'error' | 'offline';

export interface SyncState {
  status: SyncStatus;
  lastSyncAt: number | null;
  error: string | null;
  pendingPush: { cards: number; reviews: number };
}

// Wire format: server cards drop the userID (added server-side from session)
// and may carry `deletedAt` as a tombstone marker.
export type CardWire = Omit<Card, 'userID'> & { deletedAt?: number };

// Reviews are append-only; same shape as ReviewLog minus userID.
export type ReviewWire = Omit<ReviewLog, 'userID'>;
