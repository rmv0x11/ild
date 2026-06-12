import type { SynonymParseResult } from '@/lib/csv/synonymParser';
import { parseSynonymCsv } from '@/lib/csv/synonymParser';

export interface SynonymPreset {
  id: string;
  name: string;
  description: string;
  /** Примерное число карточек для показа до загрузки CSV. */
  approxCards: number;
  /** Имя файла внутри `/decks/` (без ведущего слэша). */
  file: string;
}

export const SYNONYM_PRESETS: SynonymPreset[] = [
  {
    id: 'syn-hsk',
    name: 'Синонимы HSK',
    description:
      '20 пар близких по значению слов с разбором различий: значения, оттенки, коллокации.',
    approxCards: 20,
    file: 'synonyms-hsk.csv',
  },
];

export function getSynonymPreset(id: string): SynonymPreset | undefined {
  return SYNONYM_PRESETS.find((p) => p.id === id);
}

function presetUrl(file: string): string {
  const base = (import.meta.env.BASE_URL ?? '/').replace(/\/$/, '');
  return `${base}/decks/${file}`;
}

export async function loadSynonymPresetCsv(p: SynonymPreset): Promise<SynonymParseResult> {
  const url = presetUrl(p.file);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Не удалось загрузить набор "${p.name}" (HTTP ${res.status})`);
  }
  const text = await res.text();
  return parseSynonymCsv(text);
}
