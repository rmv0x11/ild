// Save/load a full-database backup to/from a file, bridging the pure backup
// core (src/lib/storage/backup.ts) to the actual file I/O. On the web we trigger
// an anchor download; on native we write the JSON to the Capacitor Filesystem
// and open the share sheet so the user can save it to Files/Drive/etc. Import
// uses a plain <input type="file"> in both cases (WKWebView and Android WebView
// both support it).

import { isNativePlatform } from '@/lib/platform';
import {
  backupFilename,
  createBackup,
  parseBackup,
  restoreBackup,
  serializeBackup,
  type RestoreMode,
  type RestoreResult,
} from '@/lib/storage';

export interface ExportResult {
  filename: string;
  /** true when handed to the native share sheet, false when downloaded on web. */
  shared: boolean;
}

export async function exportBackupFile(now: number): Promise<ExportResult> {
  const json = serializeBackup(await createBackup(now));
  const filename = backupFilename(now);

  if (isNativePlatform()) {
    const [{ Filesystem, Directory, Encoding }, { Share }] = await Promise.all([
      import('@capacitor/filesystem'),
      import('@capacitor/share'),
    ]);
    const { uri } = await Filesystem.writeFile({
      path: filename,
      data: json,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
    });
    await Share.share({ title: filename, url: uri, dialogTitle: 'Сохранить резервную копию ild' });
    return { filename, shared: true };
  }

  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return { filename, shared: false };
}

export async function importBackupFile(file: File, mode: RestoreMode): Promise<RestoreResult> {
  const text = await file.text();
  const backup = parseBackup(text); // throws a user-facing Error on invalid input
  return restoreBackup(backup, mode);
}
