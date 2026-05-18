import { db } from '@/lib/storage/db';

export interface StreakResult {
  current: number;
  longest: number;
}

function startOfDayMs(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function previousDayStartMs(ms: number): number {
  const d = new Date(ms);
  d.setDate(d.getDate() - 1);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function nextDayStartMs(ms: number): number {
  const d = new Date(ms);
  d.setDate(d.getDate() + 1);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function computeLongest(days: Set<number>): number {
  if (days.size === 0) return 0;
  const sorted = Array.from(days).sort((a, b) => a - b);
  let longest = 1;
  let current = 1;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === nextDayStartMs(sorted[i - 1])) {
      current += 1;
      longest = Math.max(longest, current);
    } else {
      current = 1;
    }
  }
  return longest;
}

/**
 * Compute the user's review streak from the `reviews` table.
 *
 * - `current` counts back from today (or yesterday if the user hasn't yet
 *   reviewed anything today — yesterday's streak isn't broken until the day
 *   actually ends).
 * - `longest` is the longest contiguous run of any-time-in-history.
 *
 * Uses Date math (not raw 86_400_000 ms) so DST days don't accidentally break
 * a streak by being 23 or 25 hours long.
 */
export async function getStreak(now: number): Promise<StreakResult> {
  const days = new Set<number>();
  await db.reviews.each((r) => {
    days.add(startOfDayMs(r.reviewedAt));
  });

  if (days.size === 0) return { current: 0, longest: 0 };

  const today = startOfDayMs(now);
  const yesterday = previousDayStartMs(today);

  let cursor: number;
  if (days.has(today)) {
    cursor = today;
  } else if (days.has(yesterday)) {
    cursor = yesterday;
  } else {
    return { current: 0, longest: computeLongest(days) };
  }

  let current = 0;
  while (days.has(cursor)) {
    current += 1;
    cursor = previousDayStartMs(cursor);
  }

  return { current, longest: Math.max(current, computeLongest(days)) };
}
