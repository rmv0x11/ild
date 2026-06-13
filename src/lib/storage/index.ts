export { db, IldDatabase, type MetaRow } from './db';
export {
  addCards,
  getDueCards,
  getNextDueCard,
  updateCard,
  getAllCards,
  clearAll,
  getStats,
} from './cards';
export { logReview, getReviewsFor } from './reviews';
export {
  createBackup,
  serializeBackup,
  parseBackup,
  restoreBackup,
  backupFilename,
  BACKUP_VERSION,
  type BackupFile,
  type BackupCounts,
  type RestoreMode,
  type RestoreResult,
} from './backup';
export {
  importSynonymDeck,
  getSynonymDecks,
  getSynonymCards,
  getSynonymDeckCounts,
  deleteSynonymDeck,
} from './synonyms';
