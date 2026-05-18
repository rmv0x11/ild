import { useLiveQuery } from 'dexie-react-hooks';
import { Flame } from 'lucide-react';
import { getStreak } from '@/lib/stats/streak';
import { cn } from '@/lib/utils';

interface StreakBadgeProps {
  className?: string;
}

/**
 * Compact "🔥 N дней" pill. Hidden when the user has no streak yet — there's
 * no positive signal in showing "0 days" on first session.
 */
export function StreakBadge({ className }: StreakBadgeProps) {
  const streak = useLiveQuery(() => getStreak(Date.now()), []);

  if (!streak || streak.current === 0) return null;

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100',
        className,
      )}
      title={`Текущая серия: ${streak.current} дн. Лучшая: ${streak.longest} дн.`}
      data-testid="streak-badge"
    >
      <Flame className="h-3.5 w-3.5" />
      <span>{streak.current} дн.</span>
    </div>
  );
}
