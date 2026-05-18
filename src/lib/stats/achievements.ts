import { db } from '@/lib/storage/db';
import { getKnownDeckIds } from '@/lib/storage/cards';
import { PRESETS } from '@/lib/presets';
import { getStreak } from './streak';

export interface AchievementStats {
  totalReviews: number;
  matureCount: number;
  streakCurrent: number;
  streakLongest: number;
  /** Number of distinct deckIds present in the cards table. */
  decksLoaded: number;
  /** Deck ids whose every card has reached the `mature` stage. */
  completedDeckIds: string[];
}

export type AchievementGroup = 'reviews' | 'streak' | 'mature' | 'decks' | 'hsk';

export interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;
  group: AchievementGroup;
  check: (s: AchievementStats) => boolean;
}

function reviewsAchievement(
  n: number,
  id: string,
  title: string,
  icon: string,
): Achievement {
  return {
    id,
    title,
    icon,
    description: `Завершить ${n} ${pluralizeReviews(n)} карточек`,
    group: 'reviews',
    check: (s) => s.totalReviews >= n,
  };
}

function streakAchievement(
  n: number,
  id: string,
  title: string,
  icon: string,
): Achievement {
  return {
    id,
    title,
    icon,
    description: `${n} ${pluralizeDays(n)} подряд с обзорами`,
    group: 'streak',
    // The user keeps a "longest" streak even after it breaks — counting that
    // here lets the badge stay unlocked instead of un-unlocking, which would
    // be a depressing UX.
    check: (s) => Math.max(s.streakCurrent, s.streakLongest) >= n,
  };
}

function matureAchievement(
  n: number,
  id: string,
  title: string,
  icon: string,
): Achievement {
  return {
    id,
    title,
    icon,
    description: `${n} ${pluralizeCards(n)} в зрелом состоянии`,
    group: 'mature',
    check: (s) => s.matureCount >= n,
  };
}

function hskDoneAchievement(level: number): Achievement {
  return {
    id: `hsk-${level}-done`,
    title: `HSK ${level} завершён`,
    icon: '🥋',
    description: `Все карточки HSK ${level} в зрелом состоянии`,
    group: 'hsk',
    check: (s) => s.completedDeckIds.includes(`hsk-${level}`),
  };
}

function pluralizeReviews(n: number): string {
  if (n % 10 === 1 && n % 100 !== 11) return 'обзор';
  if ([2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100)) return 'обзора';
  return 'обзоров';
}

function pluralizeDays(n: number): string {
  if (n % 10 === 1 && n % 100 !== 11) return 'день';
  if ([2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100)) return 'дня';
  return 'дней';
}

function pluralizeCards(n: number): string {
  if (n % 10 === 1 && n % 100 !== 11) return 'карточка';
  if ([2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100)) return 'карточки';
  return 'карточек';
}

export const ACHIEVEMENTS: Achievement[] = [
  reviewsAchievement(1, 'reviews-1', 'Первый шаг', '🥇'),
  reviewsAchievement(10, 'reviews-10', 'Втянулся', '🌱'),
  reviewsAchievement(50, 'reviews-50', 'Полсотни', '⚡'),
  reviewsAchievement(100, 'reviews-100', 'Сотня', '💯'),
  reviewsAchievement(500, 'reviews-500', 'Полтыщи', '🚀'),
  reviewsAchievement(1000, 'reviews-1000', 'Тысячник', '👑'),
  reviewsAchievement(5000, 'reviews-5000', 'Полиглот', '🏆'),

  streakAchievement(3, 'streak-3', 'Втянулся в ритм', '🔥'),
  streakAchievement(7, 'streak-7', 'Неделя подряд', '🔥'),
  streakAchievement(14, 'streak-14', 'Две недели', '🔥'),
  streakAchievement(30, 'streak-30', 'Месяц подряд', '🔥'),
  streakAchievement(100, 'streak-100', 'Железная воля', '💎'),

  matureAchievement(1, 'mature-1', 'Первая зрелая', '🌳'),
  matureAchievement(50, 'mature-50', 'Крепкий запас', '🌳'),
  matureAchievement(250, 'mature-250', 'Серьёзный словарный', '🌳'),
  matureAchievement(1000, 'mature-1000', 'Глубокая память', '🌲'),

  {
    id: 'decks-1',
    title: 'Первый набор',
    icon: '📚',
    description: 'Загрузить первый готовый набор',
    group: 'decks',
    check: (s) => s.decksLoaded >= 1,
  },
  {
    id: 'decks-3',
    title: 'Полка наборов',
    icon: '📚',
    description: 'Загрузить 3 готовых набора',
    group: 'decks',
    check: (s) => s.decksLoaded >= 3,
  },
  {
    id: 'decks-all',
    title: 'Коллекционер',
    icon: '🎒',
    description: 'Загрузить все готовые наборы',
    group: 'decks',
    check: (s) => s.decksLoaded >= PRESETS.length,
  },

  hskDoneAchievement(1),
  hskDoneAchievement(2),
  hskDoneAchievement(3),
  hskDoneAchievement(4),
  hskDoneAchievement(5),
  hskDoneAchievement(6),
];

export function computeUnlocked(stats: AchievementStats): Set<string> {
  const out = new Set<string>();
  for (const a of ACHIEVEMENTS) {
    if (a.check(stats)) out.add(a.id);
  }
  return out;
}

export async function gatherAchievementStats(now: number): Promise<AchievementStats> {
  const totalReviews = await db.reviews.count();
  const matureCount = await db.cards.where('stage').equals('mature').count();
  const { current: streakCurrent, longest: streakLongest } = await getStreak(now);
  const deckIds = await getKnownDeckIds();

  const completedDeckIds: string[] = [];
  for (const id of deckIds) {
    const cards = await db.cards.where('deckId').equals(id).toArray();
    if (cards.length === 0) continue;
    if (cards.every((c) => c.stage === 'mature')) {
      completedDeckIds.push(id);
    }
  }

  return {
    totalReviews,
    matureCount,
    streakCurrent,
    streakLongest,
    decksLoaded: deckIds.length,
    completedDeckIds,
  };
}
