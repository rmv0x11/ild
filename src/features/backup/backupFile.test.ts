import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Card } from '@/types/domain';
import { db } from '@/lib/storage/db';
import { createBackup, serializeBackup } from '@/lib/storage';
import { exportBackupFile, importBackupFile } from './backupFile';

// In jsdom, Capacitor.isNativePlatform() returns false, so these exercise the
// web path (anchor download + <input type=file> import).

function card(id: string, word: string): Card {
  return {
    id,
    lang: 'zh',
    word,
    pinyin: 'pīn',
    context: 'ctx',
    stage: 'new',
    learningStep: 0,
    intervalDays: 0,
    ease: 2.5,
    dueAt: 0,
    reps: 0,
    lapses: 0,
    createdAt: 0,
    updatedAt: 0,
  };
}

async function clearDb(): Promise<void> {
  await Promise.all([
    db.cards.clear(),
    db.reviews.clear(),
    db.synonymDecks.clear(),
    db.synonymCards.clear(),
  ]);
}

describe('features/backup/backupFile', () => {
  beforeEach(clearDb);
  afterEach(async () => {
    vi.restoreAllMocks();
    await clearDb();
  });

  it('importBackupFile(replace) restores a backup file into the DB', async () => {
    await db.cards.bulkAdd([card('c1', '你好'), card('c2', '谢谢')]);
    const json = serializeBackup(await createBackup(1));

    await clearDb();
    await db.cards.add(card('zzz', 'leftover'));

    const file = new File([json], 'ild-backup.json', { type: 'application/json' });
    const res = await importBackupFile(file, 'replace');

    expect(res.cards).toBe(2);
    expect((await db.cards.toArray()).map((c) => c.id).sort()).toEqual(['c1', 'c2']);
  });

  it('importBackupFile rejects a non-backup file', async () => {
    const file = new File(['{"nope":1}'], 'x.json', { type: 'application/json' });
    await expect(importBackupFile(file, 'merge')).rejects.toThrow(/резервной копии/);
  });

  it('exportBackupFile (web) downloads a JSON blob with the dated filename', async () => {
    await db.cards.add(card('c1', '你好'));
    const createUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');
    const revokeUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);

    const res = await exportBackupFile(Date.UTC(2026, 5, 13));

    expect(res).toEqual({ filename: 'ild-backup-2026-06-13.json', shared: false });
    expect(createUrl).toHaveBeenCalledTimes(1);
    expect(createUrl.mock.calls[0][0]).toBeInstanceOf(Blob);
    expect(click).toHaveBeenCalled();
    expect(revokeUrl).toHaveBeenCalledWith('blob:mock');
  });
});
