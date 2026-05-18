import { parseDeckCsv, SAMPLE_CSV } from '@/lib/csv/parser';
import { addCards } from '@/lib/storage/cards';

export async function loadSampleDeck(now: number): Promise<{ added: number; skipped: number }> {
  const { rows } = parseDeckCsv(SAMPLE_CSV);
  return addCards(rows, now);
}
