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

  it('recognizes a Korean-language header and does not import it as a card', () => {
    const text = '단어,발음,의미\n사과,sagwa,яблоко\n책,chaek,книга';
    const { rows, errors } = parseDeckCsv(text);
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(2);
    expect(rows[0].word).toBe('사과');
    expect(rows[0].pinyin).toBe('sagwa');
    expect(rows.some((r) => r.word === '단어')).toBe(false);
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

describe('parseDeckCsv: Excel-формат с ;', () => {
  it('parses semicolon-delimited CSV with the english header', () => {
    const text = `word;pinyin;context
你好;nǐ hǎo;Привет`;
    const { rows, errors } = parseDeckCsv(text);
    expect(errors).toEqual([]);
    expect(rows).toEqual([{ word: '你好', pinyin: 'nǐ hǎo', context: 'Привет' }]);
  });

  it('maps russian headers and merges the synonym column into context', () => {
    const text = `слово;пиньинь;перевод;синоним
爱惜;àixī;беречь/дорожить;珍惜`;
    const { rows, errors } = parseDeckCsv(text);
    expect(errors).toEqual([]);
    expect(rows).toEqual([
      { word: '爱惜', pinyin: 'àixī', context: 'беречь/дорожить (синоним: 珍惜)' },
    ]);
  });

  it('handles the real Excel export: BOM, CRLF, Column1..4 header, empty ;;; row', () => {
    const text =
      '﻿Column1;Column2;Column3;Column4\r\n' +
      ';;;\r\n' +
      '爱惜;àixī;беречь/дорожить;珍惜\r\n' +
      '宝贵;bǎoguì;драгоценный;\r\n';
    const { rows, errors } = parseDeckCsv(text);
    expect(errors).toEqual([]);
    expect(rows).toEqual([
      { word: '爱惜', pinyin: 'àixī', context: 'беречь/дорожить (синоним: 珍惜)' },
      { word: '宝贵', pinyin: 'bǎoguì', context: 'драгоценный' },
    ]);
  });

  it('treats a file without any header row as positional data', () => {
    const text = `爱惜;àixī;беречь
宝贵;bǎoguì;драгоценный`;
    const { rows, errors } = parseDeckCsv(text);
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ word: '爱惜', pinyin: 'àixī', context: 'беречь' });
  });

  it('respects header order different from the conventional one', () => {
    const text = `пиньинь;перевод;слово
àixī;беречь;爱惜`;
    const { rows, errors } = parseDeckCsv(text);
    expect(errors).toEqual([]);
    expect(rows).toEqual([{ word: '爱惜', pinyin: 'àixī', context: 'беречь' }]);
  });

  it('does not append an empty synonym', () => {
    const text = `слово;пиньинь;перевод;синоним
爱惜;àixī;беречь;`;
    const { rows } = parseDeckCsv(text);
    expect(rows[0].context).toBe('беречь');
  });

  it('reports a header error when a required column is missing', () => {
    const text = `слово;пиньинь;заметка
爱惜;àixī;беречь`;
    const { rows, errors } = parseDeckCsv(text);
    expect(rows).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0].line).toBe(1);
    expect(errors[0].message).toMatch(/context\/перевод/);
  });

  it('handles quoted fields containing semicolons', () => {
    const text = `word;pinyin;context
你好;nǐ hǎo;"раз; два; три"`;
    const { rows, errors } = parseDeckCsv(text);
    expect(errors).toEqual([]);
    expect(rows[0].context).toBe('раз; два; три');
  });

  it('keeps correct line numbers for row errors after a fake Excel header', () => {
    const text = `Column1;Column2;Column3
;;
爱惜;;беречь`;
    const { rows, errors } = parseDeckCsv(text);
    expect(rows).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0].line).toBe(3);
    expect(errors[0].message).toMatch(/pinyin/);
  });

  it('returns no rows and no errors for an empty file', () => {
    const { rows, errors } = parseDeckCsv('');
    expect(rows).toEqual([]);
    expect(errors).toEqual([]);
  });
});

describe('parseDeckCsv: устойчивость к реальным файлам', () => {
  it('chooses ; for a headerless file whose translations are comma-rich', () => {
    const text = `你好;nǐ hǎo;привет, здравствуй, добрый день
谢谢;xiè xie;спасибо, благодарю, признателен`;
    const { rows, errors } = parseDeckCsv(text);
    expect(errors).toEqual([]);
    expect(rows).toEqual([
      { word: '你好', pinyin: 'nǐ hǎo', context: 'привет, здравствуй, добрый день' },
      { word: '谢谢', pinyin: 'xiè xie', context: 'спасибо, благодарю, признателен' },
    ]);
  });

  it('is not confused by blank lines around headerless ; data', () => {
    const text = '\n\n爱惜;àixī;беречь\n\n宝贵;bǎoguì;драгоценный\n\n';
    const { rows, errors } = parseDeckCsv(text);
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(2);
    expect(rows[0].word).toBe('爱惜');
  });

  it('honours the Excel sep=; hint and keeps physical line numbers', () => {
    const text = 'sep=;\nword;pinyin;context\n你好;nǐ hǎo;привет\n谢谢;;спасибо';
    const { rows, errors } = parseDeckCsv(text);
    expect(rows).toEqual([{ word: '你好', pinyin: 'nǐ hǎo', context: 'привет' }]);
    expect(errors).toEqual([{ line: 4, message: 'pinyin is required' }]);
  });

  it('skips a deck-title preamble above a recognized header with a notice', () => {
    const text = `Моя колода HSK4
слово;пиньинь;перевод
你好;nǐ hǎo;привет`;
    const { rows, errors } = parseDeckCsv(text);
    expect(rows).toEqual([{ word: '你好', pinyin: 'nǐ hǎo', context: 'привет' }]);
    expect(errors).toEqual([{ line: 1, message: 'строка перед заголовком пропущена' }]);
  });

  it('skips an unrecognized header (front;back;notes) instead of importing it as a card', () => {
    const text = `front;back;notes
你好;nǐ hǎo;привет`;
    const { rows, errors } = parseDeckCsv(text);
    expect(rows).toEqual([{ word: '你好', pinyin: 'nǐ hǎo', context: 'привет' }]);
    expect(errors).toEqual([{ line: 1, message: 'строка похожа на заголовок — пропущена' }]);
  });

  it('recognizes russian Excel placeholders Столбец1..N', () => {
    const text = `Столбец1;Столбец2;Столбец3;Столбец4
爱惜;àixī;беречь;珍惜`;
    const { rows, errors } = parseDeckCsv(text);
    expect(errors).toEqual([]);
    expect(rows).toEqual([{ word: '爱惜', pinyin: 'àixī', context: 'беречь (синоним: 珍惜)' }]);
  });

  it('does not mistake card content matching a header alias for a header', () => {
    const text = `翻译;fānyì;перевод
你好;nǐ hǎo;привет`;
    const { rows, errors } = parseDeckCsv(text);
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ word: '翻译', pinyin: 'fānyì', context: 'перевод' });
  });

  it('rejects a wrongly encoded file with a clear UTF-8 message', () => {
    const { rows, errors } = parseDeckCsv('��;n� h�o;��');
    expect(rows).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toMatch(/UTF-8/);
  });

  it('drops a record with an unterminated quote instead of importing the swallowed tail', () => {
    const text = `word,pinyin,context
你好,nǐ hǎo,"незакрытая
谢谢,xiè xie,спасибо`;
    const { rows, errors } = parseDeckCsv(text);
    expect(rows).toEqual([]);
    expect(errors.some((e) => e.line === 2 && /пропущена/.test(e.message))).toBe(true);
  });

  it('keeps physical line numbers across multiline quoted cells', () => {
    const text = `word,pinyin,context
你好,nǐ hǎo,"строка 1
строка 2"
谢谢,,спасибо`;
    const { rows, errors } = parseDeckCsv(text);
    expect(rows).toHaveLength(1);
    expect(errors).toEqual([{ line: 4, message: 'pinyin is required' }]);
  });

  it('trims outer whitespace from every field including context', () => {
    const text = `word;pinyin;context
你好; nǐ hǎo ; перевод `;
    const { rows } = parseDeckCsv(text);
    expect(rows).toEqual([{ word: '你好', pinyin: 'nǐ hǎo', context: 'перевод' }]);
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
