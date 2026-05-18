export type Rating = 'again' | 'hard' | 'good' | 'easy';

export type CardStage = 'new' | 'learning' | 'young' | 'mature' | 'relearning';

export interface Card {
  id: string;
  word: string;
  pinyin: string;
  context: string;

  stage: CardStage;
  learningStep: number;
  intervalDays: number;
  ease: number;
  dueAt: number;
  reps: number;
  lapses: number;

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
