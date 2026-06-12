import { describe, expect, it, vi, afterEach } from 'vitest';
import { SYNONYM_PRESETS, getSynonymPreset, loadSynonymPresetCsv } from './synonyms';

describe('synonym presets registry', () => {
  it('every preset is structurally valid', () => {
    expect(SYNONYM_PRESETS.length).toBeGreaterThan(0);
    for (const preset of SYNONYM_PRESETS) {
      expect(preset.id.trim()).not.toBe('');
      expect(preset.name.trim()).not.toBe('');
      expect(preset.description.trim()).not.toBe('');
      expect(preset.file).toMatch(/\.csv$/);
      expect(preset.approxCards).toBeGreaterThan(0);
    }
  });

  it('has unique ids across all presets', () => {
    const ids = SYNONYM_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('includes the syn-hsk preset', () => {
    expect(SYNONYM_PRESETS.some((p) => p.id === 'syn-hsk')).toBe(true);
  });

  it('getSynonymPreset finds an existing preset by id', () => {
    const first = SYNONYM_PRESETS[0];
    expect(getSynonymPreset(first.id)).toBe(first);
  });

  it('getSynonymPreset returns undefined for an unknown id', () => {
    expect(getSynonymPreset('does-not-exist')).toBeUndefined();
  });
});

describe('loadSynonymPresetCsv', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches the CSV by preset file and parses it without errors', async () => {
    const csv = `word,synonym,explanation\n爱惜,珍惜,"**爱惜** — беречь; **珍惜** — дорожить."\n`;
    const fetchMock = vi.fn<(input: RequestInfo | URL) => Promise<Response>>(
      async () =>
        ({
          ok: true,
          status: 200,
          text: async () => csv,
        }) as unknown as Response,
    );
    vi.stubGlobal('fetch', fetchMock);

    const preset = SYNONYM_PRESETS[0];
    const result = await loadSynonymPresetCsv(preset);
    expect(result.errors).toEqual([]);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toEqual({
      word: '爱惜',
      synonym: '珍惜',
      explanation: '**爱惜** — беречь; **珍惜** — дорожить.',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain(`/decks/${preset.file}`);
  });

  it('throws an error mentioning the preset name when the fetch fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({ ok: false, status: 404, text: () => Promise.resolve('') } as Response),
      ),
    );
    const preset = SYNONYM_PRESETS[0];
    await expect(loadSynonymPresetCsv(preset)).rejects.toThrow(preset.name);
  });
});
