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

type FieldKey = 'word' | 'pinyin' | 'context' | 'synonym';

// Только латиница/кириллица: иероглифические варианты (汉字, 拼音, 翻译) — это
// реальные словарные слова и в первой строке беззаголовочного файла дают ложный заголовок.
const HEADER_ALIASES = new Map<string, FieldKey>([
  ['word', 'word'],
  ['слово', 'word'],
  ['иероглиф', 'word'],
  ['단어', 'word'],
  ['어휘', 'word'],
  ['낱말', 'word'],
  ['pinyin', 'pinyin'],
  ['пиньинь', 'pinyin'],
  ['romanization', 'pinyin'],
  ['romanisation', 'pinyin'],
  ['romaja', 'pinyin'],
  ['reading', 'pinyin'],
  ['romanized', 'pinyin'],
  ['романизация', 'pinyin'],
  ['чтение', 'pinyin'],
  ['발음', 'pinyin'],
  ['로마자', 'pinyin'],
  ['context', 'context'],
  ['контекст', 'context'],
  ['перевод', 'context'],
  ['translation', 'context'],
  ['meaning', 'context'],
  ['의미', 'context'],
  ['뜻', 'context'],
  ['번역', 'context'],
  ['synonym', 'synonym'],
  ['synonyms', 'synonym'],
  ['синоним', 'synonym'],
  ['синонимы', 'synonym'],
]);

// Excel/Power Query экспортирует лист без строки заголовка как Column1;… (Столбец1;… в русском Excel)
const EXCEL_PLACEHOLDER = /^(column|столбец)\d+$/i;

const POSITIONAL_ORDER: FieldKey[] = ['word', 'pinyin', 'context', 'synonym'];

const REQUIRED_KEYS = ['word', 'pinyin', 'context'] as const;

const REQUIRED_LABELS: Record<(typeof REQUIRED_KEYS)[number], string> = {
  word: 'word/слово',
  pinyin: 'pinyin/пиньинь',
  context: 'context/перевод',
};

const DELIMITERS = [',', ';', '\t', '|'];
const ANY_DELIMITER = /[,;\t|]/;
// A "word" cell in the target language: Chinese Han characters or Korean Hangul.
// Used to tell a data row from a stray non-header first line.
const HAS_WORD_SCRIPT = /\p{Script=Han}|\p{Script=Hangul}/u;
// U+FFFD / NUL появляются, когда cp1251- или UTF-16-файл декодировали как UTF-8
function hasEncodingGarbage(text: string): boolean {
  return text.includes('\uFFFD') || text.includes('\u0000');
}
// заголовок может прятаться за преамбулой (название колоды и т.п.), но не глубже
const HEADER_SCAN_LIMIT = 5;

function isEmptyRow(cells: string[]): boolean {
  return cells.every((cell) => cell.trim() === '');
}

function positionalIndex(): Partial<Record<FieldKey, number>> {
  const indexOf: Partial<Record<FieldKey, number>> = {};
  POSITIONAL_ORDER.forEach((key, index) => {
    indexOf[key] = index;
  });
  return indexOf;
}

interface ColumnLayout {
  indexOf: Partial<Record<FieldKey, number>>;
  /** Индекс первой строки данных в matrix. */
  dataStart: number;
  /** Заголовок (явный или Column1..N) однозначно опознан — сильный якорь для выбора разделителя. */
  headerRecognized: boolean;
  headerError?: { index: number; message: string };
  /** Пропущенные строки с пояснением — ничего не выбрасываем молча. */
  skipped: Array<{ index: number; message: string }>;
}

function detectLayout(matrix: string[][]): ColumnLayout {
  const nonEmpty: number[] = [];
  matrix.forEach((row, index) => {
    if (!isEmptyRow(row)) nonEmpty.push(index);
  });
  if (nonEmpty.length === 0) {
    return { indexOf: {}, dataStart: matrix.length, headerRecognized: false, skipped: [] };
  }

  for (const index of nonEmpty.slice(0, HEADER_SCAN_LIMIT)) {
    const recognized: Partial<Record<FieldKey, number>> = {};
    matrix[index].forEach((cell, column) => {
      const key = HEADER_ALIASES.get(cell.trim().toLowerCase());
      if (key !== undefined && recognized[key] === undefined) {
        recognized[key] = column;
      }
    });
    // одиночное совпадение — почти наверняка содержимое карточки («перевод», «слово»), а не заголовок
    if (Object.keys(recognized).length < 2) continue;

    const skipped = nonEmpty
      .filter((i) => i < index)
      .map((i) => ({ index: i, message: 'строка перед заголовком пропущена' }));
    const missing = REQUIRED_KEYS.filter((key) => recognized[key] === undefined).map(
      (key) => REQUIRED_LABELS[key],
    );
    if (missing.length > 0) {
      return {
        indexOf: recognized,
        dataStart: index + 1,
        headerRecognized: true,
        skipped,
        headerError: { index, message: `в заголовке не хватает колонок: ${missing.join(', ')}` },
      };
    }
    return { indexOf: recognized, dataStart: index + 1, headerRecognized: true, skipped };
  }

  const first = nonEmpty[0];
  const firstCells = matrix[first].map((cell) => cell.trim());
  const filled = firstCells.filter((cell) => cell !== '');
  if (filled.length > 0 && filled.every((cell) => EXCEL_PLACEHOLDER.test(cell))) {
    return {
      indexOf: positionalIndex(),
      dataStart: first + 1,
      headerRecognized: true,
      skipped: [],
    };
  }

  // Беззаголовочные данные. Первая строка без иероглифов/хангыля над строками с
  // ними — почти наверняка нераспознанный заголовок (front;back;…), а не карточка.
  const laterHasScript = nonEmpty.slice(1).some((i) => HAS_WORD_SCRIPT.test(matrix[i][0] ?? ''));
  const firstWord = firstCells[0] ?? '';
  if (firstWord !== '' && !HAS_WORD_SCRIPT.test(firstWord) && laterHasScript) {
    return {
      indexOf: positionalIndex(),
      dataStart: first + 1,
      headerRecognized: false,
      skipped: [{ index: first, message: 'строка похожа на заголовок — пропущена' }],
    };
  }

  return { indexOf: positionalIndex(), dataStart: first, headerRecognized: false, skipped: [] };
}

interface Evaluation {
  rows: CsvRow[];
  errors: ParseError[];
  score: number;
}

function evaluate(text: string, delimiter: string, lineOffset: number): Evaluation {
  const rows: CsvRow[] = [];
  const errors: ParseError[] = [];

  const result = Papa.parse<string[]>(text, {
    header: false,
    delimiter,
    skipEmptyLines: false,
    dynamicTyping: false,
  });

  const matrix = (result.data ?? []).map((row) =>
    Array.isArray(row) ? row.map((cell) => (typeof cell === 'string' ? cell : '')) : [],
  );

  // физическая строка каждой записи: ячейки в кавычках могут содержать переводы строк
  const lineOf: number[] = [];
  let nextLine = 1 + lineOffset;
  for (const record of matrix) {
    lineOf.push(nextLine);
    nextLine += 1 + record.reduce((n, cell) => n + (cell.split(/\r\n|\r|\n/).length - 1), 0);
  }
  const lineAt = (index: number): number => lineOf[index] ?? nextLine;

  // запись с битой кавычкой засасывает в себя остаток файла — её нельзя отдавать как данные
  const broken = new Set<number>();
  for (const papaError of result.errors) {
    const index = typeof papaError.row === 'number' ? papaError.row : -1;
    let message = papaError.message;
    if (papaError.code === 'MissingQuotes' || papaError.code === 'InvalidQuotes') {
      if (index >= 0) broken.add(index);
      message += ' — строка пропущена';
    }
    errors.push({ line: index >= 0 ? lineAt(index) : 0, message });
  }

  const layout = detectLayout(matrix);
  for (const skip of layout.skipped) {
    errors.push({ line: lineAt(skip.index), message: skip.message });
  }
  if (layout.headerError) {
    errors.push({ line: lineAt(layout.headerError.index), message: layout.headerError.message });
    return { rows, errors, score: 1000 - errors.length };
  }

  const cellAt = (cells: string[], key: FieldKey): string => {
    const index = layout.indexOf[key];
    return index !== undefined ? (cells[index] ?? '') : '';
  };

  // слово и пиньинь не должны содержать кандидатов в разделители: их присутствие —
  // признак того, что файл разрезан не тем символом
  let leaks = 0;

  for (let i = layout.dataStart; i < matrix.length; i++) {
    if (broken.has(i)) continue;
    const cells = matrix[i];
    if (isEmptyRow(cells)) continue;

    const line = lineAt(i);
    const word = cellAt(cells, 'word').trim();
    const pinyin = cellAt(cells, 'pinyin').trim();
    const context = cellAt(cells, 'context').trim();
    const synonym = cellAt(cells, 'synonym').trim();

    if (!word) {
      errors.push({ line, message: 'word is required' });
      continue;
    }
    if (!pinyin) {
      errors.push({ line, message: 'pinyin is required' });
      continue;
    }
    if (!context) {
      errors.push({ line, message: 'context is required' });
      continue;
    }

    if (ANY_DELIMITER.test(word) || ANY_DELIMITER.test(pinyin)) leaks++;
    rows.push({ word, pinyin, context: synonym ? `${context} (синоним: ${synonym})` : context });
  }

  const score =
    (layout.headerRecognized ? 1000 : 0) + rows.length * 10 - leaks * 15 - errors.length;
  return { rows, errors, score };
}

export function parseDeckCsv(text: string): ParseResult {
  let cleaned = stripBom(text);

  if (hasEncodingGarbage(cleaned)) {
    return {
      rows: [],
      errors: [
        {
          line: 1,
          message:
            'файл не в кодировке UTF-8 — пересохраните его как «CSV UTF-8» (в Excel: Файл → Сохранить как → CSV UTF-8)',
        },
      ],
    };
  }

  let lineOffset = 0;
  let candidates = DELIMITERS;
  // Excel-подсказка "sep=;" в первой строке задаёт разделитель явно
  const sepHint = /^sep=(.)\r?\n/i.exec(cleaned);
  if (sepHint) {
    candidates = [sepHint[1]];
    cleaned = cleaned.slice(sepHint[0].length);
    lineOffset = 1;
  }

  if (cleaned.trim() === '') {
    return { rows: [], errors: [] };
  }

  let best: Evaluation = evaluate(cleaned, candidates[0], lineOffset);
  for (const delimiter of candidates.slice(1)) {
    const evaluation = evaluate(cleaned, delimiter, lineOffset);
    if (evaluation.score > best.score) {
      best = evaluation;
    }
  }
  return { rows: best.rows, errors: best.errors };
}

export function stringifyDeckCsv(rows: CsvRow[]): string {
  const data = rows.map((r) => ({
    word: r.word,
    pinyin: r.pinyin,
    context: r.context,
  }));
  return Papa.unparse(data, { header: true, columns: ['word', 'pinyin', 'context'] });
}
