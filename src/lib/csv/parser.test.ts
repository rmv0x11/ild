import { describe, expect, it } from 'vitest';
import { parseDeckCsv, stringifyDeckCsv, SAMPLE_CSV } from './parser';
import type { CsvRow } from '@/types/domain';

describe('parseDeckCsv', () => {
  it('parses the bundled SAMPLE_CSV (2 rows)', () => {
    const { rows, errors } = parseDeckCsv(SAMPLE_CSV);
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(2);

    expect(rows[0].word).toBe('你好');
    expect(rows[0].pinyin).toBe('nǐ hǎo');
    expect(rows[0].context).toContain('你好');
    expect(rows[0].context).toContain('→');

    expect(rows[1].word).toBe('谢谢');
    expect(rows[1].pinyin).toBe('xiè xie');
    expect(rows[1].context).toContain('谢谢');
  });

  it('ignores the BOM at the start of the input', () => {
    const withBom = '﻿' + SAMPLE_CSV;
    const { rows, errors } = parseDeckCsv(withBom);
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(2);
    expect(rows[0].word).toBe('你好');
  });

  it('handles fields containing commas inside quotes', () => {
    const text = `word,pinyin,context
hi,"a, b","hello, world"`;
    const { rows, errors } = parseDeckCsv(text);
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(rows[0].word).toBe('hi');
    expect(rows[0].pinyin).toBe('a, b');
    expect(rows[0].context).toBe('hello, world');
  });

  it('reports an error with the line number for an empty column', () => {
    const text = `word,pinyin,context
你好,,**你好** контекст`;
    const { rows, errors } = parseDeckCsv(text);
    expect(rows).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0].line).toBe(2);
    expect(errors[0].message).toMatch(/pinyin/);
  });

  it('reports separate errors for missing word and missing context', () => {
    const text = `word,pinyin,context
,nǐ hǎo,context here
你好,nǐ hǎo,`;
    const { rows, errors } = parseDeckCsv(text);
    expect(rows).toHaveLength(0);
    expect(errors).toHaveLength(2);
    expect(errors[0].line).toBe(2);
    expect(errors[0].message).toMatch(/word/);
    expect(errors[1].line).toBe(3);
    expect(errors[1].message).toMatch(/context/);
  });
});

describe('stringifyDeckCsv', () => {
  it('round-trips through parseDeckCsv', () => {
    const original: CsvRow[] = [
      {
        word: '你好',
        pinyin: 'nǐ hǎo',
        context: '**你好** 是中文中最常见的问候语。 → Привет — самое распространённое приветствие.',
      },
      {
        word: '谢谢',
        pinyin: 'xiè xie',
        context: 'комма, внутри строки — должна сохраниться',
      },
    ];

    const csv = stringifyDeckCsv(original);
    const { rows, errors } = parseDeckCsv(csv);

    expect(errors).toEqual([]);
    expect(rows).toEqual(original);
  });

  it('outputs columns in the order word, pinyin, context', () => {
    const csv = stringifyDeckCsv([{ word: 'a', pinyin: 'b', context: 'c' }]);
    const firstLine = csv.split(/\r?\n/)[0];
    expect(firstLine).toBe('word,pinyin,context');
  });
});
