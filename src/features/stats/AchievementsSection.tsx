import { useLiveQuery } from 'dexie-react-hooks';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ACHIEVEMENTS,
  computeUnlocked,
  gatherAchievementStats,
  type AchievementGroup,
} from '@/lib/stats/achievements';
import { cn } from '@/lib/utils';

const GROUP_TITLE: Record<AchievementGroup, string> = {
  reviews: 'Обзоры',
  streak: 'Серии дней',
  mature: 'Зрелые карточки',
  decks: 'Наборы',
  hsk: 'HSK',
};

const GROUP_ORDER: AchievementGroup[] = ['reviews', 'streak', 'mature', 'decks', 'hsk'];

export function AchievementsSection() {
  const stats = useLiveQuery(() => gatherAchievementStats(Date.now()), []);
  if (!stats) return null;

  const unlocked = computeUnlocked(stats);
  const total = ACHIEVEMENTS.length;
  const got = unlocked.size;

  const byGroup = new Map<AchievementGroup, typeof ACHIEVEMENTS>();
  for (const a of ACHIEVEMENTS) {
    const arr = byGroup.get(a.group) ?? [];
    arr.push(a);
    byGroup.set(a.group, arr);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Достижения{' '}
          <span className="text-sm font-normal text-muted-foreground">
            ({got} / {total})
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {GROUP_ORDER.map((group) => {
          const items = byGroup.get(group);
          if (!items || items.length === 0) return null;
          return (
            <section key={group} className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold text-muted-foreground">
                {GROUP_TITLE[group]}
              </h3>
              <ul className="grid gap-2 sm:grid-cols-2">
                {items.map((a) => {
                  const isUnlocked = unlocked.has(a.id);
                  return (
                    <li
                      key={a.id}
                      className={cn(
                        'flex items-start gap-3 rounded-md border p-3 text-sm transition-colors',
                        isUnlocked ? 'bg-card' : 'bg-muted/40 text-muted-foreground',
                      )}
                      data-unlocked={isUnlocked}
                    >
                      <div
                        className={cn(
                          'text-2xl leading-none',
                          !isUnlocked && 'opacity-30 grayscale',
                        )}
                        aria-hidden
                      >
                        {a.icon}
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <div className="font-medium">{a.title}</div>
                        <div className="text-xs">{a.description}</div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </CardContent>
    </Card>
  );
}
