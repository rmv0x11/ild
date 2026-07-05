export type Rating = 'again' | 'hard' | 'good' | 'easy';

export type CardStage = 'new' | 'learning' | 'young' | 'mature' | 'relearning';

/** Study language a card belongs to. See src/lib/lang/language.ts. */
export type Language = 'zh' | 'ko';

export interface Card {
  id: string;
  /**
   * The study language of this card. Drives TTS locale, the label of the
   * reading step and which "world" the card appears in. Cards created before
   * multi-language support are backfilled to 'zh' by the v4 DB migration.
   */
  lang: Language;
  word: string;
  /**
   * Phonetic reading: pinyin for Chinese, Revised-Romanization (romaja) for
   * Korean. The field keeps its original name for storage/back-compat; the UI
   * labels it per language via LANGUAGE_META[lang].readingLabel.
   */
  pinyin: string;
  context: string;

  stage: CardStage;
  learningStep: number;
  intervalDays: number;
  ease: number;
  dueAt: number;
  reps: number;
  lapses: number;

  /**
   * Optional source-deck identifier set on import. Cards added by hand-uploaded
   * CSV leave this undefined; cards added via a preset use the preset id
   * (e.g. "hsk-1", "topic-food"). Used by the deck-filter UI to scope review
   * sessions to a single preset.
   */
  deckId?: string;

  createdAt: number;
  updatedAt: number;
}

export interface ReviewLog {
  id?: number;
  cardId: string;
  rating: Rating;
  reviewedAt: number;
  stageBefore: CardStage;
  stageAfter: CardStage;
  intervalDaysBefore: number;
  intervalDaysAfter: number;
  easeBefore: number;
  easeAfter: number;
}

export interface CsvRow {
  word: string;
  pinyin: string;
  context: string;
}

export interface DeckStats {
  total: number;
  new: number;
  learning: number;
  young: number;
  mature: number;
  relearning: number;
  dueNow: number;
  dueToday: number;
}

// --- Синонимические колоды ---
// Отдельный режим в стиле Quizlet: без SM-2, без ReviewLog и без учёта
// в статистике обучения. Кнопки «Знаю» / «Не знаю», раунды до полного «Знаю».

export type SynonymAnswer = 'know' | 'dont-know';

export interface SynonymDeck {
  id: string;
  name: string;
  createdAt: number;
}

export interface SynonymCard {
  id: string;
  /** Иероглиф (слово) — сторона 1. */
  word: string;
  /** Иероглиф-синоним — сторона 2 (вместо пиньиня и TTS). */
  synonym: string;
  /** Объяснение разницы значений — сторона 3. */
  explanation: string;
  deckId: string;
  createdAt: number;
  updatedAt: number;
}

export interface SynonymCsvRow {
  word: string;
  synonym: string;
  explanation: string;
}
