import { describe, expect, it, vi, afterEach } from 'vitest';
import { PRESETS, getPreset, loadPresetCsv } from './index';

describe('presets registry', () => {
  it('exposes both topic and hsk categories', () => {
    const cats = new Set(PRESETS.map((p) => p.category));
    expect(cats.has('topic')).toBe(true);
    expect(cats.has('hsk')).toBe(true);
  });

  it('has unique ids across all presets', () => {
    const ids = PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('getPreset finds by id', () => {
    const first = PRESETS[0];
    expect(getPreset(first.id)).toBe(first);
    expect(getPreset('does-not-exist')).toBeUndefined();
  });
});

describe('loadPresetCsv', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches the CSV by file and parses it', async () => {
    const csv = `word,pinyin,context\n你好,nǐ hǎo,**你好** → Привет.\n`;
    const fetchMock = vi.fn<(input: RequestInfo | URL) => Promise<Response>>(async () =>
      ({
        ok: true,
        status: 200,
        text: async () => csv,
      }) as unknown as Response,
    );
    vi.stubGlobal('fetch', fetchMock);

    const preset = PRESETS[0];
    const result = await loadPresetCsv(preset);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].word).toBe('你好');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/decks\/.+\.csv$/);
  });

  it('throws when the fetch fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({ ok: false, status: 404, text: () => Promise.resolve('') } as Response),
      ),
    );
    await expect(loadPresetCsv(PRESETS[0])).rejects.toThrow(/HTTP 404/);
  });
});
