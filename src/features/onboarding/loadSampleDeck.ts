import { parseDeckCsv, SAMPLE_CSV } from '@/lib/csv/parser';
import { addCards } from '@/lib/storage/cards';

export async function loadSampleDeck(now: number): Promise<{ added: number; skipped: number }> {
  // The built-in sample deck is Chinese.
  const { rows } = parseDeckCsv(SAMPLE_CSV);
  return addCards(rows, now, { lang: 'zh' });
}
