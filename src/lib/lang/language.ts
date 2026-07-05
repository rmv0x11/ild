// Language registry — the single source of truth for the set of study languages
// the app supports and everything that differs per language (TTS locale, the
// name of the "reading" step, exam branding, collation, …). The app started
// Chinese-only; Korean was added by generalizing every Chinese-specific string
// and locale through this table. Add a new language by adding one entry here and
// a set of preset decks.

import type { Language } from '@/types/domain';

export type { Language };

export const DEFAULT_LANGUAGE: Language = 'zh';

export const LANGUAGES: readonly Language[] = ['zh', 'ko'] as const;

export interface LanguageMeta {
  code: Language;
  /** Emoji flag used in the compact language switcher. */
  flag: string;
  /** Russian display name, e.g. "Китайский". */
  name: string;
  /** Endonym shown as a secondary label, e.g. "中文" / "한국어". */
  nativeName: string;
  /** Header subtitle next to the "ild" wordmark. */
  subtitle: string;
  /** Label for the phonetic-reading step (step 2), e.g. "Пиньинь". */
  readingLabel: string;
  /** Full CTA on step 1 revealing the reading, e.g. "Показать пиньинь". */
  readingCta: string;
  /** Full placeholder for the cards search box. */
  searchHint: string;
  /** Column/label for the word itself, e.g. "Иероглиф" / "Слово". */
  wordLabel: string;
  /** BCP-47 tag handed to the speech synthesizer. */
  ttsLang: string;
  /** Voice-list filter prefix (matched case-insensitively against voice.lang). */
  voicePrefix: string;
  /** Human name of the voice pack to install when none is found. */
  voiceName: string;
  /** Proficiency exam this language's graded decks target. */
  examName: string;
  /** Section title in the preset gallery for the exam decks. */
  examSectionTitle: string;
  /** Locale passed to String.localeCompare for sorting words. */
  collation: string;
}

export const LANGUAGE_META: Record<Language, LanguageMeta> = {
  zh: {
    code: 'zh',
    flag: '🇨🇳',
    name: 'Китайский',
    nativeName: '中文',
    subtitle: 'китайский · SM-2',
    readingLabel: 'Пиньинь',
    readingCta: 'Показать пиньинь',
    searchHint: 'Поиск по слову или пиньиню…',
    wordLabel: 'Иероглиф',
    ttsLang: 'zh-CN',
    voicePrefix: 'zh',
    voiceName: 'Китайский (Mandarin)',
    examName: 'HSK',
    examSectionTitle: 'Подготовка к HSK',
    collation: 'zh-Hans',
  },
  ko: {
    code: 'ko',
    flag: '🇰🇷',
    name: 'Корейский',
    nativeName: '한국어',
    subtitle: 'корейский · SM-2',
    readingLabel: 'Романизация',
    readingCta: 'Показать романизацию',
    searchHint: 'Поиск по слову или романизации…',
    wordLabel: 'Слово',
    ttsLang: 'ko-KR',
    voicePrefix: 'ko',
    voiceName: 'Корейский',
    examName: 'TOPIK',
    examSectionTitle: 'Подготовка к TOPIK',
    collation: 'ko',
  },
};

export function isLanguage(value: unknown): value is Language {
  return value === 'zh' || value === 'ko';
}

export function getLanguageMeta(lang: Language): LanguageMeta {
  return LANGUAGE_META[lang];
}

/** Normalize a possibly-missing/legacy card language to a supported one. */
export function normalizeLanguage(value: unknown): Language {
  return isLanguage(value) ? value : DEFAULT_LANGUAGE;
}
