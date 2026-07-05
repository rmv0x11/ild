import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { BookOpen, Sparkles, X } from 'lucide-react';
import type { Card as DomainCard } from '@/types/domain';
import { getAllCards } from '@/lib/storage/cards';
import { normalizeLanguage } from '@/lib/lang/language';
import { Card, CardContent } from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ReviewStep1 } from '@/features/review/ReviewStep1';
import { ReviewStep2 } from '@/features/review/ReviewStep2';
import { DeckSelector } from '@/features/deck/DeckSelector';
import { useDeckFilter } from '@/features/deck/useDeckFilter';
import { useActiveLanguage } from '@/features/lang/useActiveLanguage';
import { DECK_ALL } from '@/lib/storage/deckFilter';
import { cn } from '@/lib/utils';
import { PracticeStep3 } from './PracticeStep3';
import { PracticeDoneScreen } from './PracticeDoneScreen';

type Step = 1 | 2 | 3;

const MAX_PRACTICE_CARDS = 20;

function shuffle<T>(items: readonly T[]): T[] {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function PracticePage() {
  const [filter] = useDeckFilter();
  const [lang] = useActiveLanguage();
  const allCards = useLiveQuery<DomainCard[] | undefined>(
    () => getAllCards(lang, filter),
    [filter, lang],
  );

  if (allCards === undefined) {
    return (
      <div className="flex animate-pulse flex-col gap-4">
        <div className="bg-muted h-2 w-full rounded" />
        <div className="bg-muted h-72 rounded-lg" />
      </div>
    );
  }

  if (allCards.length === 0) {
    const filtered = filter !== DECK_ALL;
    return (
      <div className="flex flex-col gap-4">
        <DeckSelector />
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-16">
            <div className="bg-muted rounded-full p-6">
              <BookOpen className="text-muted-foreground h-12 w-12" />
            </div>
            <div className="text-lg font-medium">
              {filtered ? 'В выбранной колоде нет карточек' : 'Сначала загрузите карты'}
            </div>
            <p className="text-muted-foreground max-w-sm text-center text-sm">
              {filtered
                ? 'Переключите фильтр на «Все колоды» или загрузите CSV/готовый набор.'
                : 'В колоде пока пусто. Загрузите CSV-колоду, чтобы начать тренировку.'}
            </p>
            <Link to="/import" className={buttonVariants({ variant: 'default', size: 'lg' })}>
              <Sparkles className="mr-2 h-4 w-4" /> Загрузить колоду
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <DeckSelector />
      <PracticeSession cards={allCards} />
    </div>
  );
}

function PracticeSession({ cards }: { cards: DomainCard[] }) {
  const [sessionId, setSessionId] = useState(0);
  const deck = useMemo(
    () => shuffle(cards).slice(0, MAX_PRACTICE_CARDS),
    // Re-shuffle when "restart" is triggered. Intentionally do not depend on
    // `cards` itself so that the deck stays stable during a session even if
    // useLiveQuery emits a new array reference.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sessionId],
  );

  const [index, setIndex] = useState(0);
  const [step, setStep] = useState<Step>(1);

  const total = deck.length;
  const isDone = index >= total;
  const current = isDone ? undefined : deck[index];

  const advance = useCallback((): void => {
    setIndex((i) => i + 1);
    setStep(1);
  }, []);

  const restart = useCallback((): void => {
    setIndex(0);
    setStep(1);
    setSessionId((id) => id + 1);
  }, []);

  useEffect(() => {
    if (!current) return;
    const handler = (e: KeyboardEvent): void => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key !== ' ' && e.key !== 'Enter') return;

      if (step === 1) {
        e.preventDefault();
        setStep(2);
      } else if (step === 2) {
        const btn = document.querySelector<HTMLButtonElement>('button[data-step3-trigger]');
        if (btn && !btn.disabled) {
          e.preventDefault();
          btn.click();
        }
      } else if (step === 3) {
        e.preventDefault();
        advance();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [step, advance, current]);

  if (isDone) {
    return (
      <div className="flex flex-col gap-4">
        <PracticeHeader index={total} total={total} />
        <PracticeDoneScreen count={total} onRestart={restart} />
      </div>
    );
  }

  if (!current) return null;

  return (
    <div className="flex flex-col gap-4">
      <PracticeHeader index={index + 1} total={total} />

      <div className="text-muted-foreground mb-1 flex items-center justify-center gap-2 text-sm">
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
          <div key={`${current.id}-${step}`} className="animate-in fade-in duration-300">
            {step === 1 && (
              <ReviewStep1
                word={current.word}
                lang={normalizeLanguage(current.lang)}
                onNext={() => setStep(2)}
              />
            )}
            {step === 2 && (
              <ReviewStep2
                key={current.id}
                word={current.word}
                reading={current.pinyin}
                lang={normalizeLanguage(current.lang)}
                onNext={() => setStep(3)}
              />
            )}
            {step === 3 && (
              <PracticeStep3
                word={current.word}
                reading={current.pinyin}
                context={current.context}
                onNext={advance}
              />
            )}
          </div>
        </CardContent>
      </Card>

      <div className="text-muted-foreground mt-1 text-center text-xs">
        Подсказка: <kbd className="bg-muted rounded border px-1.5 py-0.5">Space</kbd> — далее
      </div>
    </div>
  );
}

function PracticeHeader({ index, total }: { index: number; total: number }) {
  const value = total > 0 ? (index / total) * 100 : 0;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-muted-foreground text-sm">
          {index} / {total}
        </div>
        <Link
          to="/review"
          className={buttonVariants({ variant: 'ghost', size: 'sm' })}
          aria-label="Завершить тренировку"
        >
          <X className="mr-1 h-4 w-4" />
          Завершить
        </Link>
      </div>
      <Progress value={value} />
    </div>
  );
}
