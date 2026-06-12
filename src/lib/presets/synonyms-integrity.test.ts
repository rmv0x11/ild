import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseSynonymCsv } from '@/lib/csv/synonymParser';
import { SYNONYM_PRESETS } from './synonyms';

// Иероглифы CJK (базовый блок Unified Ideographs покрывает лексику HSK)
const CJK = /[一-鿿]/;

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

describe('synonym preset CSV integrity', () => {
  for (const preset of SYNONYM_PRESETS) {
    describe(`"${preset.name}" (${preset.file})`, () => {
      const path = resolve(process.cwd(), 'public', 'decks', preset.file);
      const text = readFileSync(path, 'utf8');
      const { rows, errors } = parseSynonymCsv(text);

      it(`parses with no errors and exactly ${preset.approxCards} rows`, () => {
        expect(errors).toEqual([]);
        expect(rows).toHaveLength(preset.approxCards);
      });

      it('every row has non-empty word, synonym and explanation', () => {
        for (const row of rows) {
          expect(row.word.trim()).not.toBe('');
          expect(row.synonym.trim()).not.toBe('');
          expect(row.explanation.trim()).not.toBe('');
        }
      });

      it('word differs from synonym in every row', () => {
        for (const row of rows) {
          expect(row.word).not.toBe(row.synonym);
        }
      });

      it('word and synonym contain CJK ideographs', () => {
        for (const row of rows) {
          expect(row.word).toMatch(CJK);
          expect(row.synonym).toMatch(CJK);
        }
      });

      it('explanation is >= 100 chars and has balanced ** markers', () => {
        for (const row of rows) {
          expect(row.explanation.length).toBeGreaterThanOrEqual(100);
          expect(countOccurrences(row.explanation, '**') % 2).toBe(0);
        }
      });
    });
  }
});
