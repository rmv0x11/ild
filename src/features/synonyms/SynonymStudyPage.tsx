import { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, PartyPopper, RotateCcw, X } from 'lucide-react';
import type { SynonymAnswer, SynonymCard, SynonymDeck } from '@/types/domain';
import { getSynonymCards, getSynonymDecks } from '@/lib/storage/synonyms';
import {
  answerCurrent,
  isRoundFinished,
  isSessionFinished,
  nextRound,
  startSession,
  type SynonymSessionState,
} from '@/lib/synonyms/session';
import { renderBold } from '@/features/review/markdown';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { plural } from '@/lib/plural';

type Step = 1 | 2 | 3;

function shuffle<T>(items: readonly T[]): T[] {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function SynonymStudyPage() {
  const { deckId } = useParams<{ deckId: string }>();
  const data = useLiveQuery(async () => {
    if (!deckId) return { deck: null, cards: [] as SynonymCard[] };
    const [decks, cards] = await Promise.all([getSynonymDecks(), getSynonymCards(deckId)]);
    return { deck: decks.find((d) => d.id === deckId) ?? null, cards };
  }, [deckId]);

  if (data === undefined) {
    return (
      <div className="flex animate-pulse flex-col gap-4">
        <div className="bg-muted h-2 w-full rounded" />
        <div className="bg-muted h-72 rounded-lg" />
      </div>
    );
  }

  if (!data.deck) {
    return <EmptyMessage title="Колода не найдена" />;
  }

  if (data.cards.length === 0) {
    return <EmptyMessage title="В колоде нет карточек" />;
  }

  return <SynonymSession key={data.deck.id} deck={data.deck} cards={data.cards} />;
}

function EmptyMessage({ title }: { title: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-4 py-16">
        <div className="text-lg font-medium">{title}</div>
        <Link to="/synonyms" className={buttonVariants({ variant: 'default', size: 'lg' })}>
          <ArrowLeft />К списку колод
        </Link>
      </CardContent>
    </Card>
  );
}

function SynonymSession({ deck, cards }: { deck: SynonymDeck; cards: SynonymCard[] }) {
  // Перемешиваем один раз на сессию: live-обновления `cards` не пересобирают
  // колоду, а полный рестарт перемешивает заново через restart().
  const [shuffled, setShuffled] = useState<SynonymCard[]>(() => shuffle(cards));
  const [session, setSession] = useState<SynonymSessionState>(() =>
    startSession(shuffled.map((c) => c.id)),
  );
  const [step, setStep] = useState<Step>(1);

  const byId = useMemo(() => new Map(shuffled.map((c) => [c.id, c])), [shuffled]);

  const roundFinished = isRoundFinished(session);
  const finished = isSessionFinished(session);

  const answer = useCallback((a: SynonymAnswer): void => {
    setSession((s) => answerCurrent(s, a));
    setStep(1);
  }, []);

  const restart = useCallback((): void => {
    const next = shuffle(cards);
    setShuffled(next);
    setSession(startSession(next.map((c) => c.id)));
    setStep(1);
  }, [cards]);

  const handleNextRound = (): void => {
    setSession((s) => nextRound(s));
    setStep(1);
  };

  // useLayoutEffect: слушатель должен быть повешен синхронно с коммитом, иначе
  // нажатие в зазоре между отрисовкой шага и флашем пассивных эффектов теряется.
  useLayoutEffect(() => {
    if (roundFinished) return;
    const handler = (e: KeyboardEvent): void => {
      // Не перехватываем клавиши на интерактивных элементах: Enter на ссылке
      // «Завершить» и Space на сфокусированной кнопке обрабатываются нативно
      // (иначе глобальный preventDefault ломает навигацию и даёт двойное срабатывание).
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'A' ||
        tag === 'BUTTON' ||
        tag === 'SELECT'
      )
        return;

      if (step === 1 && (e.key === ' ' || e.key === 'Enter')) {
        e.preventDefault();
        setStep(2);
      } else if (step === 2 && (e.key === ' ' || e.key === 'Enter')) {
        e.preventDefault();
        setStep(3);
      } else if (step === 3) {
        if (e.key === '1') {
          e.preventDefault();
          answer('dont-know');
        } else if (e.key === '2') {
          e.preventDefault();
          answer('know');
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [step, roundFinished, answer]);

  if (finished) {
    return (
      <div className="flex flex-col gap-4">
        <SessionHeader
          deckName={deck.name}
          round={session.round}
          answered={session.queue.length}
          total={session.queue.length}
        />
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-16">
            <div className="bg-muted rounded-full p-6">
              <PartyPopper className="text-muted-foreground h-12 w-12" />
            </div>
            <div className="text-lg font-medium">Вся колода отмечена «Знаю»!</div>
            <p className="text-muted-foreground text-center text-sm">
              {session.initialCount}{' '}
              {plural(session.initialCount, ['карточка', 'карточки', 'карточек'])} за{' '}
              {session.round} {plural(session.round, ['раунд', 'раунда', 'раундов'])}.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <Button size="lg" onClick={restart}>
                <RotateCcw />
                Пройти ещё раз
              </Button>
              <Link to="/synonyms" className={buttonVariants({ variant: 'outline', size: 'lg' })}>
                <ArrowLeft />К колодам
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (roundFinished) {
    return (
      <div className="flex flex-col gap-4">
        <SessionHeader
          deckName={deck.name}
          round={session.round}
          answered={session.queue.length}
          total={session.queue.length}
        />
        <Card>
          <CardContent className="flex flex-col items-center gap-6 py-12">
            <div className="text-lg font-medium">Раунд {session.round} завершён</div>
            <div className="flex gap-10 text-center">
              <div>
                <div className="text-3xl font-bold" data-testid="round-known">
                  {session.knownThisRound}
                </div>
                <div className="text-muted-foreground text-sm">знаю</div>
              </div>
              <div>
                <div className="text-destructive text-3xl font-bold" data-testid="round-missed">
                  {session.missed.length}
                </div>
                <div className="text-muted-foreground text-sm">не знаю</div>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button size="lg" onClick={handleNextRound}>
                <RotateCcw />
                Повторить незнакомые ({session.missed.length})
              </Button>
              <Link to="/synonyms" className={buttonVariants({ variant: 'ghost', size: 'lg' })}>
                Завершить
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const currentId = session.queue[session.index];
  const current = currentId !== undefined ? byId.get(currentId) : undefined;
  if (!current) return null;

  return (
    <div className="flex flex-col gap-4">
      <SessionHeader
        deckName={deck.name}
        round={session.round}
        answered={session.index}
        total={session.queue.length}
      />

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
            {step === 1 && <StepWord word={current.word} onNext={() => setStep(2)} />}
            {step === 2 && (
              <StepSynonym
                word={current.word}
                synonym={current.synonym}
                onNext={() => setStep(3)}
              />
            )}
            {step === 3 && <StepExplanation card={current} onAnswer={answer} />}
          </div>
        </CardContent>
      </Card>

      <div className="text-muted-foreground mt-1 text-center text-xs">
        {step === 3 ? (
          <>
            Подсказка: <kbd className="bg-muted rounded border px-1.5 py-0.5">1</kbd> — не знаю,{' '}
            <kbd className="bg-muted rounded border px-1.5 py-0.5">2</kbd> — знаю
          </>
        ) : (
          <>
            Подсказка: <kbd className="bg-muted rounded border px-1.5 py-0.5">Space</kbd> — далее
          </>
        )}
      </div>
    </div>
  );
}

interface SessionHeaderProps {
  deckName: string;
  round: number;
  /** Сколько карточек раунда уже отвечено (0-based индекс текущей). */
  answered: number;
  total: number;
}

function SessionHeader({ deckName, round, answered, total }: SessionHeaderProps) {
  const value = total > 0 ? (answered / total) * 100 : 0;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-muted-foreground text-sm">
          <span className="text-foreground font-medium">{deckName}</span> · Раунд {round} ·{' '}
          {Math.min(answered + 1, total)} / {total}
        </div>
        <Link
          to="/synonyms"
          className={buttonVariants({ variant: 'ghost', size: 'sm' })}
          aria-label="Завершить сессию"
        >
          <X className="mr-1 h-4 w-4" />
          Завершить
        </Link>
      </div>
      <Progress value={value} />
    </div>
  );
}

function StepWord({ word, onNext }: { word: string; onNext: () => void }) {
  return (
    <div className="flex flex-col items-center gap-10 py-12">
      <div className="text-center text-7xl font-semibold tracking-tight" data-testid="syn-word">
        {word}
      </div>
      <Button size="lg" onClick={onNext}>
        Показать синоним
      </Button>
    </div>
  );
}

function StepSynonym({
  word,
  synonym,
  onNext,
}: {
  word: string;
  synonym: string;
  onNext: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-8 py-12">
      <div className="text-center text-7xl font-semibold tracking-tight">{word}</div>
      <div className="flex flex-col items-center gap-1">
        <div className="text-muted-foreground text-xs tracking-wide uppercase">синоним</div>
        <div
          className="text-primary text-center text-5xl font-semibold tracking-tight"
          data-testid="syn-synonym"
        >
          {synonym}
        </div>
      </div>
      <Button size="lg" onClick={onNext}>
        Показать разницу
      </Button>
    </div>
  );
}

function StepExplanation({
  card,
  onAnswer,
}: {
  card: SynonymCard;
  onAnswer: (a: SynonymAnswer) => void;
}) {
  return (
    <div className="flex flex-col items-center gap-8 py-10">
      <div className="flex flex-wrap items-baseline justify-center gap-4">
        <div className="text-5xl font-semibold tracking-tight">{card.word}</div>
        <div className="text-muted-foreground text-2xl">·</div>
        <div className="text-primary text-5xl font-semibold tracking-tight">{card.synonym}</div>
      </div>
      <div
        className="max-w-prose text-center text-lg leading-relaxed"
        data-testid="syn-explanation"
      >
        {renderBold(card.explanation)}
      </div>
      <div className="flex flex-wrap justify-center gap-3">
        <Button variant="outline" size="lg" onClick={() => onAnswer('dont-know')}>
          Не знаю
        </Button>
        <Button size="lg" onClick={() => onAnswer('know')}>
          Знаю
        </Button>
      </div>
    </div>
  );
}
