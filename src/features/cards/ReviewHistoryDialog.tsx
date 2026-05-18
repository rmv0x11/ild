import { useCallback, useEffect } from 'react';
import { X } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { CardStage, Rating } from '@/types/domain';
import { db } from '@/lib/storage/db';
import { Badge } from '@/components/ui/badge';

export interface ReviewHistoryDialogProps {
  cardId: string;
  word: string;
  onClose: () => void;
}

const RATING_LABEL: Record<Rating, string> = {
  again: 'Заново',
  hard: 'Плохо',
  good: 'Хорошо',
  easy: 'Отлично',
};

const RATING_VARIANT: Record<Rating, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  again: 'destructive',
  hard: 'outline',
  good: 'secondary',
  easy: 'default',
};

const STAGE_LABEL: Record<CardStage, string> = {
  new: 'Новая',
  learning: 'Изучение',
  young: 'Молодая',
  mature: 'Зрелая',
  relearning: 'Переучивание',
};

function formatRu(ts: number): string {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(ts));
}

function formatInterval(days: number): string {
  if (days === 0) return '0д';
  if (days < 1) {
    const minutes = Math.round(days * 24 * 60);
    return `${minutes}м`;
  }
  return `${days.toFixed(days < 10 ? 1 : 0)}д`;
}

export function ReviewHistoryDialog({ cardId, word, onClose }: ReviewHistoryDialogProps) {
  const reviews = useLiveQuery(
    () => db.reviews.where('cardId').equals(cardId).reverse().sortBy('reviewedAt'),
    [cardId],
  );

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        handleClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="review-history-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-lg border bg-card text-card-foreground shadow-lg">
        <div className="flex items-center justify-between border-b p-4">
          <h2 id="review-history-title" className="text-lg font-semibold">
            История оценок <span className="font-normal text-muted-foreground">— {word}</span>
          </h2>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Закрыть"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {reviews === undefined ? (
            <div className="text-center text-sm text-muted-foreground">Загрузка…</div>
          ) : reviews.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              Эта карточка ещё не оценивалась
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="px-2 py-2 font-medium">Дата</th>
                    <th className="px-2 py-2 font-medium">Оценка</th>
                    <th className="px-2 py-2 font-medium">Стадия</th>
                    <th className="px-2 py-2 font-medium">Интервал</th>
                    <th className="px-2 py-2 font-medium">Ease</th>
                  </tr>
                </thead>
                <tbody>
                  {reviews.map((r) => (
                    <tr key={r.id} className="border-b last:border-0">
                      <td className="px-2 py-2 align-top whitespace-nowrap text-muted-foreground">
                        {formatRu(r.reviewedAt)}
                      </td>
                      <td className="px-2 py-2 align-top">
                        <Badge variant={RATING_VARIANT[r.rating]}>
                          {RATING_LABEL[r.rating]}
                        </Badge>
                      </td>
                      <td className="px-2 py-2 align-top whitespace-nowrap">
                        <span className="text-muted-foreground">
                          {STAGE_LABEL[r.stageBefore]}
                        </span>{' '}
                        <span className="text-muted-foreground">→</span>{' '}
                        <span className="font-medium">{STAGE_LABEL[r.stageAfter]}</span>
                      </td>
                      <td className="px-2 py-2 align-top whitespace-nowrap">
                        <span className="text-muted-foreground">
                          {formatInterval(r.intervalDaysBefore)}
                        </span>{' '}
                        <span className="text-muted-foreground">→</span>{' '}
                        <span className="font-medium">
                          {formatInterval(r.intervalDaysAfter)}
                        </span>
                      </td>
                      <td className="px-2 py-2 align-top whitespace-nowrap">
                        <span className="text-muted-foreground">
                          {r.easeBefore.toFixed(2)}
                        </span>{' '}
                        <span className="text-muted-foreground">→</span>{' '}
                        <span className="font-medium">{r.easeAfter.toFixed(2)}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
