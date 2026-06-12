import { describe, expect, it } from 'vitest';
import { parseSynonymCsv } from './synonymParser';

describe('parseSynonymCsv: заголовки', () => {
  it('parses CSV with english headers', () => {
    const text = `word,synonym,explanation
高兴,开心,高兴 — нейтральное; 开心 — более разговорное`;
    const { rows, errors } = parseSynonymCsv(text);
    expect(errors).toEqual([]);
    expect(rows).toEqual([
      {
        word: '高兴',
        synonym: '开心',
        explanation: '高兴 — нейтральное; 开心 — более разговорное',
      },
    ]);
  });

  it('parses CSV with russian headers (semicolon-delimited)', () => {
    const text = `слово;синоним;объяснение
帮助;帮忙;"帮助 — глагол и существительное; 帮忙 — раздельный глагол"`;
    const { rows, errors } = parseSynonymCsv(text);
    expect(errors).toEqual([]);
    expect(rows).toEqual([
      {
        word: '帮助',
        synonym: '帮忙',
        explanation: '帮助 — глагол и существительное; 帮忙 — раздельный глагол',
      },
    ]);
  });

  it('maps alias headers (иероглиф/синонимы/разница) and respects column order', () => {
    const text = `разница;иероглиф;синонимы
оттенок различия;突然;忽然`;
    const { rows, errors } = parseSynonymCsv(text);
    expect(errors).toEqual([]);
    expect(rows).toEqual([{ word: '突然', synonym: '忽然', explanation: 'оттенок различия' }]);
  });

  it('reports a header error when a required column is missing', () => {
    const text = `слово;синоним;заметка
帮助;帮忙;текст`;
    const { rows, errors } = parseSynonymCsv(text);
    expect(rows).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0].line).toBe(1);
    expect(errors[0].message).toMatch(/explanation\/объяснение/);
  });

  it('skips a deck-title preamble above a recognized header with a notice', () => {
    const text = `Моя колода синонимов HSK5
слово;синоним;объяснение
高兴;开心;разница в употреблении`;
    const { rows, errors } = parseSynonymCsv(text);
    expect(rows).toEqual([
      { word: '高兴', synonym: '开心', explanation: 'разница в употреблении' },
    ]);
    expect(errors).toEqual([{ line: 1, message: 'строка перед заголовком пропущена' }]);
  });

  it('does not treat a single-alias row (Слово;Похожее;Чем отличаются) as a header', () => {
    const text = `Слово;Похожее;Чем отличаются
高兴;开心;разница в употреблении`;
    const { rows, errors } = parseSynonymCsv(text);
    expect(rows).toEqual([
      { word: '高兴', synonym: '开心', explanation: 'разница в употреблении' },
    ]);
    expect(errors).toEqual([{ line: 1, message: 'строка похожа на заголовок — пропущена' }]);
  });

  it('skips an unrecognized header (front;back;notes) instead of importing it as a card', () => {
    const text = `front;back;notes
高兴;开心;разница`;
    const { rows, errors } = parseSynonymCsv(text);
    expect(rows).toEqual([{ word: '高兴', synonym: '开心', explanation: 'разница' }]);
    expect(errors).toEqual([{ line: 1, message: 'строка похожа на заголовок — пропущена' }]);
  });
});

describe('parseSynonymCsv: без заголовка', () => {
  it('treats a file without any header row as positional [word, synonym, explanation]', () => {
    const text = `高兴,开心,разница в употреблении
突然,忽然,突然 может быть прилагательным`;
    const { rows, errors } = parseSynonymCsv(text);
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      word: '高兴',
      synonym: '开心',
      explanation: 'разница в употреблении',
    });
    expect(rows[1].word).toBe('突然');
  });

  it('imports a headerless file whose first word is 汉字 as data, not a header', () => {
    const text = `汉字,文字,знак письма в противовес письменности в целом
近义词,同义词,близкие по смыслу слова в противовес полным синонимам`;
    const { rows, errors } = parseSynonymCsv(text);
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(2);
    expect(rows[0].word).toBe('汉字');
    expect(rows[1].word).toBe('近义词');
  });

  it('chooses ; for a headerless file whose explanations are comma-rich', () => {
    const text = `你好;您好;привет, здравствуй, добрый день
谢谢;多谢;спасибо, благодарю, признателен`;
    const { rows, errors } = parseSynonymCsv(text);
    expect(errors).toEqual([]);
    expect(rows).toEqual([
      { word: '你好', synonym: '您好', explanation: 'привет, здравствуй, добрый день' },
      { word: '谢谢', synonym: '多谢', explanation: 'спасибо, благодарю, признателен' },
    ]);
  });

  it('is not confused by blank lines around headerless data', () => {
    const text = '\n\n高兴,开心,разница\n\n突然,忽然,оттенок\n\n';
    const { rows, errors } = parseSynonymCsv(text);
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(2);
    expect(rows[0].word).toBe('高兴');
  });
});

describe('parseSynonymCsv: Excel-форматы', () => {
  it('handles the real Excel export: BOM, CRLF, Column1..3 header, empty ;; row', () => {
    const text = '﻿Column1;Column2;Column3\r\n' + ';;\r\n' + '高兴;开心;разница\r\n';
    const { rows, errors } = parseSynonymCsv(text);
    expect(errors).toEqual([]);
    expect(rows).toEqual([{ word: '高兴', synonym: '开心', explanation: 'разница' }]);
  });

  it('recognizes russian Excel placeholders Столбец1..N and imports data positionally', () => {
    const text = `Столбец1;Столбец2;Столбец3
高兴;开心;разница в употреблении`;
    const { rows, errors } = parseSynonymCsv(text);
    expect(errors).toEqual([]);
    expect(rows).toEqual([
      { word: '高兴', synonym: '开心', explanation: 'разница в употреблении' },
    ]);
  });

  it('keeps correct line numbers for row errors after a fake Excel header', () => {
    const text = `Column1;Column2;Column3
;;
高兴;;разница`;
    const { rows, errors } = parseSynonymCsv(text);
    expect(rows).toHaveLength(0);
    expect(errors).toEqual([{ line: 3, message: 'synonym is required' }]);
  });

  it('honours the Excel sep=; hint and keeps physical line numbers', () => {
    const text = 'sep=;\nword;synonym;explanation\n高兴;开心;разница\n谢谢;;спасибо';
    const { rows, errors } = parseSynonymCsv(text);
    expect(rows).toEqual([{ word: '高兴', synonym: '开心', explanation: 'разница' }]);
    expect(errors).toEqual([{ line: 4, message: 'synonym is required' }]);
  });
});

describe('parseSynonymCsv: ошибки строк', () => {
  it('reports an error with the line number for each missing field', () => {
    const text = `word,synonym,explanation
,开心,разница
高兴,,разница
高兴,开心,`;
    const { rows, errors } = parseSynonymCsv(text);
    expect(rows).toHaveLength(0);
    expect(errors).toHaveLength(3);
    expect(errors[0]).toEqual({ line: 2, message: 'word is required' });
    expect(errors[1]).toEqual({ line: 3, message: 'synonym is required' });
    expect(errors[2]).toEqual({ line: 4, message: 'explanation is required' });
  });

  it('reports a separate error for every missing field of the same row', () => {
    const text = `word,synonym,explanation
高兴,,`;
    const { rows, errors } = parseSynonymCsv(text);
    expect(rows).toHaveLength(0);
    expect(errors).toHaveLength(2);
    expect(errors[0]).toEqual({ line: 2, message: 'synonym is required' });
    expect(errors[1]).toEqual({ line: 2, message: 'explanation is required' });
  });

  it('skips fully empty rows without errors', () => {
    const text = `word,synonym,explanation

高兴,开心,разница
,,`;
    const { rows, errors } = parseSynonymCsv(text);
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(1);
  });
});

describe('parseSynonymCsv: устойчивость к битым файлам', () => {
  it('rejects a wrongly encoded file with a clear UTF-8 message', () => {
    const { rows, errors } = parseSynonymCsv('��;n�;��');
    expect(rows).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toMatch(/UTF-8/);
  });

  it('drops a record with an unterminated quote instead of importing the swallowed tail', () => {
    const text = `word,synonym,explanation
你好,您好,привет
高兴,开心,"незакрытая
谢谢,多谢,спасибо`;
    const { rows, errors } = parseSynonymCsv(text);
    // строка до битой записи цела, хвост файла не превратился в карточку
    expect(rows).toEqual([{ word: '你好', synonym: '您好', explanation: 'привет' }]);
    expect(errors.some((e) => e.line === 3 && /пропущена/.test(e.message))).toBe(true);
    expect(rows.some((r) => r.word === '谢谢')).toBe(false);
  });

  it('keeps physical line numbers across multiline quoted cells', () => {
    const text = `word,synonym,explanation
高兴,开心,"строка 1
строка 2"
谢谢,,спасибо`;
    const { rows, errors } = parseSynonymCsv(text);
    expect(rows).toHaveLength(1);
    expect(errors).toEqual([{ line: 4, message: 'synonym is required' }]);
  });
});

describe('parseSynonymCsv: спецслучаи', () => {
  it('ignores the BOM at the start of the input', () => {
    const withBom = '﻿word,synonym,explanation\n高兴,开心,разница';
    const { rows, errors } = parseSynonymCsv(withBom);
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(rows[0].word).toBe('高兴');
  });

  it('keeps a multi-line explanation inside quotes', () => {
    const text = `word,synonym,explanation
高兴,开心,"高兴 — общее слово.
开心 — подчёркивает радость, разговорное."`;
    const { rows, errors } = parseSynonymCsv(text);
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(rows[0].explanation).toBe(
      '高兴 — общее слово.\n开心 — подчёркивает радость, разговорное.',
    );
  });

  it('trims outer whitespace from every field including explanation', () => {
    const text = `word;synonym;explanation
高兴; 开心 ; разница `;
    const { rows } = parseSynonymCsv(text);
    expect(rows).toEqual([{ word: '高兴', synonym: '开心', explanation: 'разница' }]);
  });

  it('returns no rows and no errors for an empty file', () => {
    const { rows, errors } = parseSynonymCsv('');
    expect(rows).toEqual([]);
    expect(errors).toEqual([]);
  });
});
