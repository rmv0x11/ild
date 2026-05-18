import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Card as DomainCard, Rating } from '@/types/domain';
import { rateCard } from '@/lib/sm2/algorithm';
import { getNextDueCard, getStats, updateCard } from '@/lib/storage/cards';
import { logReview } from '@/lib/storage/reviews';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { ReviewStep1 } from './ReviewStep1';
import { ReviewStep2 } from './ReviewStep2';
import { ReviewStep3 } from './ReviewStep3';

type Step = 1 | 2 | 3;

export function ReviewPage() {
  const currentCard = useLiveQuery<DomainCard | undefined>(
    () => getNextDueCard(Date.now()),
    [],
  );
  const stats = useLiveQuery(() => getStats(Date.now()), []);

  if (currentCard === undefined && stats === undefined) {
    return <div className="py-10 text-center text-muted-foreground">Загрузка…</div>;
  }

  return (
    <div className="flex flex-col gap-4">
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
            <div className="text-lg font-medium">Карточек к повторению нет</div>
            <p className="text-center text-sm text-muted-foreground">
              Загрузите CSV-колоду, чтобы начать заниматься.
            </p>
            <Link to="/import" className={buttonVariants({ variant: 'default', size: 'lg' })}>
              Загрузить колоду
            </Link>
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

  const handleRate = async (rating: Rating): Promise<void> => {
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
  };

  return (
    <Card>
      <CardContent className="pt-6">
        {step === 1 && <ReviewStep1 word={card.word} onNext={() => setStep(2)} />}
        {step === 2 && (
          <ReviewStep2 word={card.word} pinyin={card.pinyin} onNext={() => setStep(3)} />
        )}
        {step === 3 && (
          <ReviewStep3
            word={card.word}
            pinyin={card.pinyin}
            context={card.context}
            onRate={handleRate}
            disabled={submitting}
          />
        )}
      </CardContent>
    </Card>
  );
}
