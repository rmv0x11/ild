import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LANGUAGE,
  LANGUAGES,
  LANGUAGE_META,
  getLanguageMeta,
  isLanguage,
  normalizeLanguage,
} from './language';

describe('language registry', () => {
  it('every supported language has complete metadata', () => {
    for (const code of LANGUAGES) {
      const meta = LANGUAGE_META[code];
      expect(meta.code).toBe(code);
      for (const key of [
        'flag',
        'name',
        'nativeName',
        'subtitle',
        'readingLabel',
        'readingCta',
        'searchHint',
        'wordLabel',
        'ttsLang',
        'voicePrefix',
        'voiceName',
        'examName',
        'examSectionTitle',
        'collation',
      ] as const) {
        expect(meta[key], `${code}.${key}`).toBeTruthy();
      }
      // TTS locale must start with the voice-filter prefix.
      expect(meta.ttsLang.toLowerCase().startsWith(meta.voicePrefix)).toBe(true);
    }
  });

  it('ships Chinese and Korean', () => {
    expect(LANGUAGES).toEqual(['zh', 'ko']);
    expect(DEFAULT_LANGUAGE).toBe('zh');
    expect(LANGUAGE_META.zh.ttsLang).toBe('zh-CN');
    expect(LANGUAGE_META.ko.ttsLang).toBe('ko-KR');
    expect(LANGUAGE_META.ko.examName).toBe('TOPIK');
  });

  it('isLanguage guards unknown values', () => {
    expect(isLanguage('zh')).toBe(true);
    expect(isLanguage('ko')).toBe(true);
    expect(isLanguage('en')).toBe(false);
    expect(isLanguage(undefined)).toBe(false);
    expect(isLanguage(null)).toBe(false);
  });

  it('normalizeLanguage falls back to the default', () => {
    expect(normalizeLanguage('ko')).toBe('ko');
    expect(normalizeLanguage(undefined)).toBe('zh');
    expect(normalizeLanguage('xx')).toBe('zh');
  });

  it('getLanguageMeta returns the right entry', () => {
    expect(getLanguageMeta('ko').name).toBe('Корейский');
  });
});
