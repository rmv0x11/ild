import { useCallback, useLayoutEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { BookOpen, Sparkles } from 'lucide-react';
import type { Card as DomainCard, Rating } from '@/types/domain';
import { rateCard } from '@/lib/sm2/algorithm';
import { getNextDueCard, getStats, updateCard } from '@/lib/storage/cards';
import { logReview } from '@/lib/storage/reviews';
import { normalizeLanguage } from '@/lib/lang/language';
import { speak } from '@/lib/tts/speak';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { DeckSelector } from '@/features/deck/DeckSelector';
import { useDeckFilter } from '@/features/deck/useDeckFilter';
import { useActiveLanguage } from '@/features/lang/useActiveLanguage';
import { DECK_ALL } from '@/lib/storage/deckFilter';
import { StreakBadge } from '@/features/stats/StreakBadge';
import { useAchievementUnlocks } from '@/features/stats/useAchievementUnlocks';
import { ReviewStep1 } from './ReviewStep1';
import { ReviewStep2 } from './ReviewStep2';
import { ReviewStep3 } from './ReviewStep3';

type Step = 1 | 2 | 3;

export function ReviewPage() {
  const [filter] = useDeckFilter();
  const [lang] = useActiveLanguage();
  useAchievementUnlocks();
  const currentCard = useLiveQuery<DomainCard | undefined>(
    () => getNextDueCard(Date.now(), lang, filter),
    [filter, lang],
  );
  const stats = useLiveQuery(() => getStats(Date.now(), lang, filter), [filter, lang]);
  const isFiltered = filter !== DECK_ALL;

  if (currentCard === undefined && stats === undefined) {
    return (
      <div className="flex animate-pulse flex-col gap-4">
        <div className="flex gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="bg-muted h-6 w-20 rounded" />
          ))}
        </div>
        <div className="bg-muted h-72 rounded-lg" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <DeckSelector />
        <StreakBadge />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">Сейчас: {stats?.dueNow ?? 0}</Badge>
        <Badge variant="outline">Новых: {stats?.new ?? 0}</Badge>
        <Badge variant="outline">Изучение: {stats?.learning ?? 0}</Badge>
        <Badge variant="outline">Молодых: {stats?.young ?? 0}</Badge>
        <Badge variant="outline">Зрелых: {stats?.mature ?? 0}</Badge>
        <Badge variant="outline">Переучивание: {stats?.relearning ?? 0}</Badge>
      </div>

      {!currentCard ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-16">
            <div className="bg-muted rounded-full p-6">
              <BookOpen className="text-muted-foreground h-12 w-12" />
            </div>
            <div className="text-lg font-medium">
              {isFiltered
                ? 'В выбранной колоде нет карточек к повторению'
                : 'Карточек к повторению нет'}
            </div>
            <p className="text-muted-foreground max-w-sm text-center text-sm">
              {isFiltered
                ? 'Переключите фильтр на «Все колоды» или подождите, пока подойдёт следующий повтор.'
                : 'Загрузите CSV-колоду, чтобы начать заниматься. Или попробуйте пример из 4 слов.'}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Link to="/import" className={buttonVariants({ variant: 'default', size: 'lg' })}>
                <Sparkles className="mr-2 h-4 w-4" /> Загрузить колоду
              </Link>
              {(stats?.total ?? 0) > 0 && (
                <>
                  <Link to="/cards" className={buttonVariants({ variant: 'outline', size: 'lg' })}>
                    Открыть колоду
                  </Link>
                  <Link
                    to="/practice"
                    className={buttonVariants({ variant: 'outline', size: 'lg' })}
                  >
                    Тренировка
                  </Link>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <ReviewCardSession key={currentCard.id} card={currentCard} />
      )}
    </div>
  );
}

function ReviewCardSession({ card }: { card: DomainCard }) {
  const [step, setStep] = useState<Step>(1);
  const [submitting, setSubmitting] = useState(false);
  const lang = normalizeLanguage(card.lang);

  const handleRate = useCallback(
    async (rating: Rating): Promise<void> => {
      if (submitting) return;
      setSubmitting(true);
      const now = Date.now();
      const after = rateCard(card, rating, now);
      await updateCard(after);
      await logReview({
        cardId: card.id,
        rating,
        reviewedAt: now,
        stageBefore: card.stage,
        stageAfter: after.stage,
        intervalDaysBefore: card.intervalDays,
        intervalDaysAfter: after.intervalDays,
        easeBefore: card.ease,
        easeAfter: after.ease,
      });
      // useLiveQuery will unmount us when a new card arrives.
    },
    [card, submitting],
  );

  // useLayoutEffect: слушатель должен быть повешен синхронно с коммитом, иначе
  // нажатие в зазоре между отрисовкой шага и флашем пассивных эффектов теряется.
  useLayoutEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      if (step === 1 && (e.key === ' ' || e.key === 'Enter')) {
        e.preventDefault();
        // Mirror ReviewStep1.onClick: fire TTS synchronously inside the
        // user-keypress event so the browser keeps its autoplay activation.
        void speak(card.word, lang);
        setStep(2);
      } else if (step === 2 && (e.key === ' ' || e.key === 'Enter')) {
        const btn = document.querySelector<HTMLButtonElement>('button[data-step3-trigger]');
        if (btn && !btn.disabled) {
          e.preventDefault();
          btn.click();
        }
      } else if (step === 3) {
        const map: Record<string, Rating> = {
          '1': 'again',
          '2': 'hard',
          '3': 'good',
          '4': 'easy',
        };
        const rating = map[e.key];
        if (rating) {
          e.preventDefault();
          void handleRate(rating);
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [step, handleRate, card.word, lang]);

  return (
    <>
      <div className="text-muted-foreground mb-3 flex items-center justify-center gap-2 text-sm">
        <span aria-label={`Шаг ${step} из 3`}>Шаг {step} / 3</span>
        <div className="flex gap-1">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className={cn(
                'h-2 w-8 rounded-full transition-colors',
                i <= step ? 'bg-primary' : 'bg-muted',
              )}
            />
          ))}
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div key={step} className="animate-in fade-in duration-300">
            {step === 1 && <ReviewStep1 word={card.word} lang={lang} onNext={() => setStep(2)} />}
            {step === 2 && (
              <ReviewStep2
                word={card.word}
                reading={card.pinyin}
                lang={lang}
                onNext={() => setStep(3)}
              />
            )}
            {step === 3 && (
              <ReviewStep3
                word={card.word}
                reading={card.pinyin}
                context={card.context}
                onRate={handleRate}
                disabled={submitting}
              />
            )}
          </div>
        </CardContent>
      </Card>

      <div className="text-muted-foreground mt-3 text-center text-xs">
        Подсказка: <kbd className="bg-muted rounded border px-1.5 py-0.5">Space</kbd> — далее, цифры{' '}
        <kbd className="bg-muted rounded border px-1.5 py-0.5">1</kbd>—
        <kbd className="bg-muted rounded border px-1.5 py-0.5">4</kbd> — оценка
      </div>
    </>
  );
}
