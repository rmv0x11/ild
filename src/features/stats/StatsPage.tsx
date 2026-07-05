import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate } from 'react-router-dom';
import { Flame } from 'lucide-react';
import { getStats } from '@/lib/storage/cards';
import { getStreak } from '@/lib/stats/streak';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { resetOnboarding } from '@/features/onboarding/onboardingState';
import { DeckSelector } from '@/features/deck/DeckSelector';
import { useDeckFilter } from '@/features/deck/useDeckFilter';
import { useActiveLanguage } from '@/features/lang/useActiveLanguage';
import { AchievementsSection } from './AchievementsSection';

interface Tile {
  label: string;
  value: number;
}

export function StatsPage() {
  const [filter] = useDeckFilter();
  const [lang] = useActiveLanguage();
  const stats = useLiveQuery(() => getStats(Date.now(), lang, filter), [filter, lang]);
  const streak = useLiveQuery(() => getStreak(Date.now()), []);
  const navigate = useNavigate();

  if (!stats) {
    return <div className="text-muted-foreground py-10 text-center">Загрузка…</div>;
  }

  const tiles: Tile[] = [
    { label: 'Всего', value: stats.total },
    { label: 'Новые', value: stats.new },
    { label: 'Изучение', value: stats.learning },
    { label: 'Молодые', value: stats.young },
    { label: 'Зрелые', value: stats.mature },
    { label: 'Переучивание', value: stats.relearning },
    { label: 'Сейчас к повтору', value: stats.dueNow },
    { label: 'Сегодня к повтору', value: stats.dueToday },
  ];

  const maturePct = stats.total > 0 ? (stats.mature / stats.total) * 100 : 0;

  const handleReplayOnboarding = (): void => {
    resetOnboarding();
    navigate('/');
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <DeckSelector />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Серия дней</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-6">
          <div className="flex items-center gap-3">
            <Flame className="h-8 w-8 text-amber-500" />
            <div>
              <div className="text-3xl leading-none font-semibold">{streak?.current ?? 0}</div>
              <div className="text-muted-foreground text-xs">
                {streak?.current === 1 ? 'день подряд' : 'дней подряд'}
              </div>
            </div>
          </div>
          <div className="text-muted-foreground text-sm">
            Лучшая серия: <strong>{streak?.longest ?? 0}</strong>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Прогресс зрелости</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between text-sm">
            <span className="text-muted-foreground">Зрелые / всего</span>
            <span className="font-medium">
              {stats.mature} / {stats.total} ({maturePct.toFixed(1)}%)
            </span>
          </div>
          <Progress value={maturePct} />
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map((tile) => (
          <Card key={tile.label}>
            <CardContent className="flex flex-col gap-1 p-4">
              <div className="text-muted-foreground text-xs tracking-wide uppercase">
                {tile.label}
              </div>
              <div className="text-3xl font-semibold">{tile.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <AchievementsSection />

      <Card>
        <CardHeader>
          <CardTitle>Обучение</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-muted-foreground text-sm">Хотите освежить вводный обзор сервиса?</p>
          <div>
            <Button variant="outline" onClick={handleReplayOnboarding}>
              Показать обучение ещё раз
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
