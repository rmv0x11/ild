import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseDeckCsv } from '@/lib/csv/parser';
import { PRESETS, getPresetsForLanguage } from './index';

const HANGUL = /\p{Script=Hangul}/u;
const ROMAJA = /^[a-z][a-z '-]*$/;

describe('Korean presets', () => {
  const koPresets = getPresetsForLanguage('ko');

  it('registers the full Korean set with unique ids under ko/', () => {
    expect(koPresets.length).toBe(11);
    for (const p of koPresets) {
      expect(p.lang).toBe('ko');
      expect(p.file.startsWith('ko/')).toBe(true);
    }
    // TOPIK exam category is present.
    expect(koPresets.some((p) => p.category === 'topik')).toBe(true);
  });

  it('all preset ids are globally unique across languages', () => {
    const ids = PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  for (const preset of koPresets) {
    it(`"${preset.name}" (${preset.id}) is well-formed Korean data`, () => {
      const path = resolve(process.cwd(), 'public', 'decks', preset.file);
      const { rows, errors } = parseDeckCsv(readFileSync(path, 'utf8'));

      expect(errors).toEqual([]);
      expect(rows.length).toBeGreaterThanOrEqual(40);

      for (const r of rows) {
        expect(HANGUL.test(r.word), `word "${r.word}" is Hangul`).toBe(true);
        expect(ROMAJA.test(r.pinyin), `romanization "${r.pinyin}" is RR`).toBe(true);
        expect(r.context.includes('→'), `context of "${r.word}" has a translation`).toBe(true);
        expect(r.context.startsWith('**'), `context of "${r.word}" is bolded`).toBe(true);
      }
    });
  }
});
