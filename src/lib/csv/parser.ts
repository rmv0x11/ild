import Papa from 'papaparse';
import type { CsvRow } from '@/types/domain';

export const SAMPLE_CSV = `word,pinyin,context
你好,nǐ hǎo,**你好** 是中文中最常见的问候语。 → Привет — самое распространённое приветствие в китайском языке.
谢谢,xiè xie,"你应该对帮助你的朋友说 **谢谢**。 → Ты должен сказать **спасибо** другу, который тебе помог."`;

export interface ParseError {
  line: number;
  message: string;
}

export interface ParseResult {
  rows: CsvRow[];
  errors: ParseError[];
}

const BOM = '﻿';

function stripBom(text: string): string {
  return text.startsWith(BOM) ? text.slice(BOM.length) : text;
}

export function parseDeckCsv(text: string): ParseResult {
  const cleaned = stripBom(text);
  const rows: CsvRow[] = [];
  const errors: ParseError[] = [];

  const result = Papa.parse<{ word?: string; pinyin?: string; context?: string }>(cleaned, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
  });

  for (const papaError of result.errors) {
    // papaparse row indices are 0-based for data rows. +2 to account for the header line.
    const line = typeof papaError.row === 'number' ? papaError.row + 2 : 0;
    errors.push({ line, message: papaError.message });
  }

  const data = result.data ?? [];
  data.forEach((raw, index) => {
    // header is line 1, first data row is line 2
    const line = index + 2;
    const word = typeof raw.word === 'string' ? raw.word.trim() : '';
    const pinyin = typeof raw.pinyin === 'string' ? raw.pinyin.trim() : '';
    // context may contain markdown; do not trim internal whitespace, but trim outer to be tolerant
    const context = typeof raw.context === 'string' ? raw.context : '';

    if (!word) {
      errors.push({ line, message: 'word is required' });
      return;
    }
    if (!pinyin) {
      errors.push({ line, message: 'pinyin is required' });
      return;
    }
    if (!context || context.trim() === '') {
      errors.push({ line, message: 'context is required' });
      return;
    }

    rows.push({ word, pinyin, context });
  });

  return { rows, errors };
}

export function stringifyDeckCsv(rows: CsvRow[]): string {
  const data = rows.map((r) => ({
    word: r.word,
    pinyin: r.pinyin,
    context: r.context,
  }));
  return Papa.unparse(data, { header: true, columns: ['word', 'pinyin', 'context'] });
}
