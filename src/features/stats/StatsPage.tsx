import { useLiveQuery } from 'dexie-react-hooks';
import { getStats } from '@/lib/storage/cards';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';

interface Tile {
  label: string;
  value: number;
}

export function StatsPage() {
  const stats = useLiveQuery(() => getStats(Date.now()), []);

  if (!stats) {
    return <div className="py-10 text-center text-muted-foreground">Загрузка…</div>;
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

  return (
    <div className="flex flex-col gap-6">
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
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                {tile.label}
              </div>
              <div className="text-3xl font-semibold">{tile.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
