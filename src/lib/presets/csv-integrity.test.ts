import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseDeckCsv } from '@/lib/csv/parser';
import { PRESETS } from './index';

describe('preset CSV integrity', () => {
  for (const preset of PRESETS) {
    it(`"${preset.name}" parses with no row errors and unique words`, () => {
      const path = resolve(process.cwd(), 'public', 'decks', preset.file);
      const text = readFileSync(path, 'utf8');
      const { rows, errors } = parseDeckCsv(text);

      expect(errors).toEqual([]);
      expect(rows.length).toBeGreaterThan(0);

      const words = rows.map((r) => r.word);
      const unique = new Set(words);
      expect(unique.size).toBe(words.length);
    });
  }
});
