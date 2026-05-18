import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Clock, Layers, Pencil, RotateCcw, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import type { Card as DomainCard, CardStage } from '@/types/domain';
import { getAllCards } from '@/lib/storage/cards';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { EditCardDialog } from './EditCardDialog';
import { ReviewHistoryDialog } from './ReviewHistoryDialog';
import { deleteCard, resetCardProgress } from './cardActions';

type SortKey = 'word' | 'stage' | 'dueAt';
type SortDir = 'asc' | 'desc';

interface StageOption {
  value: CardStage;
  label: string;
  variant: 'default' | 'secondary' | 'destructive' | 'outline';
}

const STAGE_OPTIONS: StageOption[] = [
  { value: 'new', label: 'Новые', variant: 'outline' },
  { value: 'learning', label: 'Изучение', variant: 'secondary' },
  { value: 'young', label: 'Молодые', variant: 'secondary' },
  { value: 'mature', label: 'Зрелые', variant: 'default' },
  { value: 'relearning', label: 'Переучивание', variant: 'destructive' },
];

const STAGE_LABEL: Record<CardStage, string> = {
  new: 'Новая',
  learning: 'Изучение',
  young: 'Молодая',
  mature: 'Зрелая',
  relearning: 'Переучивание',
};

const STAGE_PRIORITY: Record<CardStage, number> = {
  new: 0,
  learning: 1,
  young: 2,
  mature: 3,
  relearning: 4,
};

function formatDue(ts: number, now: number): string {
  const diff = ts - now;
  const formatter = new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  if (diff <= 0) return 'сейчас';
  return formatter.format(new Date(ts));
}

function formatInterval(days: number): string {
  if (days === 0) return '—';
  if (days < 1) {
    const minutes = Math.round(days * 24 * 60);
    return `${minutes}м`;
  }
  if (days < 10) return `${days.toFixed(1)}д`;
  return `${Math.round(days)}д`;
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n) + '…';
}

export function CardsListPage() {
  const cards = useLiveQuery(() => getAllCards(), []);

  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState<Set<CardStage>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey>('word');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const [editing, setEditing] = useState<DomainCard | null>(null);
  const [history, setHistory] = useState<DomainCard | null>(null);

  // Refresh "now" every minute so the "след. показ" column stays current.
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    const handle = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(handle);
  }, []);

  const filtered = useMemo<DomainCard[]>(() => {
    if (!cards) return [];
    const q = search.trim().toLowerCase();
    return cards.filter((card) => {
      if (stageFilter.size > 0 && !stageFilter.has(card.stage)) return false;
      if (q.length > 0) {
        const hay = `${card.word} ${card.pinyin}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [cards, search, stageFilter]);

  const sorted = useMemo<DomainCard[]>(() => {
    const arr = filtered.slice();
    arr.sort((a, b) => {
      let cmp: number;
      if (sortKey === 'word') {
        cmp = a.word.localeCompare(b.word, 'zh-Hans');
      } else if (sortKey === 'stage') {
        cmp = STAGE_PRIORITY[a.stage] - STAGE_PRIORITY[b.stage];
        if (cmp === 0) cmp = a.dueAt - b.dueAt;
      } else {
        cmp = a.dueAt - b.dueAt;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  const handleToggleStage = (stage: CardStage): void => {
    setStageFilter((prev) => {
      const next = new Set(prev);
      if (next.has(stage)) next.delete(stage);
      else next.add(stage);
      return next;
    });
  };

  const handleResetFilters = (): void => {
    setSearch('');
    setStageFilter(new Set());
  };

  const handleSort = (key: SortKey): void => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const handleReset = async (card: DomainCard): Promise<void> => {
    if (
      !window.confirm(
        `Сбросить прогресс карточки «${card.word}»? Она снова станет новой.`,
      )
    ) {
      return;
    }
    try {
      await resetCardProgress(card.id);
      toast.success('Прогресс сброшен');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Не удалось сбросить';
      toast.error(`Ошибка: ${message}`);
    }
  };

  const handleDelete = async (card: DomainCard): Promise<void> => {
    if (
      !window.confirm(
        `Удалить карточку «${card.word}»? Будет также удалена история оценок.`,
      )
    ) {
      return;
    }
    try {
      await deleteCard(card.id);
      toast.success('Карточка удалена');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Не удалось удалить';
      toast.error(`Ошибка: ${message}`);
    }
  };

  const total = cards?.length ?? 0;
  const isEmpty = cards !== undefined && cards.length === 0;
  const filtersActive = search.trim() !== '' || stageFilter.size > 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-bold tracking-tight">Все карточки</h1>
        <span className="text-sm text-muted-foreground">
          {total} {plural(total, ['карточка', 'карточки', 'карточек'])}
        </span>
      </div>

      {!isEmpty && (
        <Card>
          <CardContent className="flex flex-col gap-3 p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Input
                placeholder="Поиск по слову или пиньиню…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Поиск"
                className="sm:max-w-sm"
              />
              {filtersActive && (
                <Button variant="ghost" size="sm" onClick={handleResetFilters}>
                  <X className="h-4 w-4" />
                  Сбросить фильтры
                </Button>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {STAGE_OPTIONS.map((opt) => {
                const active = stageFilter.has(opt.value);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => handleToggleStage(opt.value)}
                    aria-pressed={active}
                    className={cn(
                      'inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      active
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-input bg-background text-foreground hover:bg-accent hover:text-accent-foreground',
                    )}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {isEmpty ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-16">
            <div className="rounded-full bg-muted p-6">
              <Layers className="h-12 w-12 text-muted-foreground" />
            </div>
            <div className="text-lg font-medium">Колода пуста — загрузите CSV</div>
            <Link
              to="/import"
              className={buttonVariants({ variant: 'default', size: 'lg' })}
            >
              Загрузить колоду
            </Link>
          </CardContent>
        </Card>
      ) : cards === undefined ? (
        <div className="py-10 text-center text-muted-foreground">Загрузка…</div>
      ) : sorted.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Ничего не найдено по текущим фильтрам.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <SortableTh
                      label="Иероглиф"
                      sortKey="word"
                      currentSort={sortKey}
                      sortDir={sortDir}
                      onSort={handleSort}
                    />
                    <th className="px-3 py-2 font-medium">Пиньинь</th>
                    <th className="hidden px-3 py-2 font-medium md:table-cell">Контекст</th>
                    <SortableTh
                      label="Стадия"
                      sortKey="stage"
                      currentSort={sortKey}
                      sortDir={sortDir}
                      onSort={handleSort}
                    />
                    <th className="hidden px-3 py-2 font-medium sm:table-cell">Интервал</th>
                    <th className="hidden px-3 py-2 font-medium lg:table-cell">Ease</th>
                    <SortableTh
                      label="След. показ"
                      sortKey="dueAt"
                      currentSort={sortKey}
                      sortDir={sortDir}
                      onSort={handleSort}
                      className="hidden sm:table-cell"
                    />
                    <th className="px-3 py-2 text-right font-medium">Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((card) => {
                    const stageOpt = STAGE_OPTIONS.find((o) => o.value === card.stage);
                    return (
                      <tr
                        key={card.id}
                        className="border-b last:border-0 hover:bg-muted/40"
                        data-testid={`card-row-${card.id}`}
                      >
                        <td className="px-3 py-2 align-top text-base font-medium">
                          {card.word}
                        </td>
                        <td className="px-3 py-2 align-top text-muted-foreground">
                          {card.pinyin}
                        </td>
                        <td className="hidden px-3 py-2 align-top text-muted-foreground md:table-cell">
                          {truncate(card.context, 60)}
                        </td>
                        <td className="px-3 py-2 align-top">
                          <Badge variant={stageOpt?.variant ?? 'outline'}>
                            {STAGE_LABEL[card.stage]}
                          </Badge>
                        </td>
                        <td className="hidden px-3 py-2 align-top whitespace-nowrap sm:table-cell">
                          {formatInterval(card.intervalDays)}
                        </td>
                        <td className="hidden px-3 py-2 align-top whitespace-nowrap lg:table-cell">
                          {card.ease.toFixed(2)}
                        </td>
                        <td className="hidden px-3 py-2 align-top whitespace-nowrap text-muted-foreground sm:table-cell">
                          {formatDue(card.dueAt, now)}
                        </td>
                        <td className="px-3 py-2 align-top text-right">
                          <div className="inline-flex gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Редактировать ${card.word}`}
                              onClick={() => setEditing(card)}
                            >
                              <Pencil />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`История ${card.word}`}
                              onClick={() => setHistory(card)}
                            >
                              <Clock />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Сбросить ${card.word}`}
                              onClick={() => void handleReset(card)}
                            >
                              <RotateCcw />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Удалить ${card.word}`}
                              onClick={() => void handleDelete(card)}
                            >
                              <Trash2 />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {editing && (
        <EditCardDialog card={editing} onClose={() => setEditing(null)} />
      )}
      {history && (
        <ReviewHistoryDialog
          cardId={history.id}
          word={history.word}
          onClose={() => setHistory(null)}
        />
      )}
    </div>
  );
}

interface SortableThProps {
  label: string;
  sortKey: SortKey;
  currentSort: SortKey;
  sortDir: SortDir;
  onSort: (key: SortKey) => void;
  className?: string;
}

function SortableTh({
  label,
  sortKey,
  currentSort,
  sortDir,
  onSort,
  className,
}: SortableThProps) {
  const active = currentSort === sortKey;
  const arrow = active ? (sortDir === 'asc' ? '▲' : '▼') : '';
  return (
    <th className={cn('px-3 py-2 font-medium', className)}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className="inline-flex items-center gap-1 transition-colors hover:text-foreground"
      >
        {label}
        {arrow && <span aria-hidden className="text-xs">{arrow}</span>}
      </button>
    </th>
  );
}

function plural(n: number, forms: [string, string, string]): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return forms[1];
  return forms[2];
}
