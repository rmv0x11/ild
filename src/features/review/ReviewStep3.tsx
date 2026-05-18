import type { Rating } from '@/types/domain';
import { RatingButtons } from './RatingButtons';
import { renderBold } from './markdown';

interface ReviewStep3Props {
  word: string;
  pinyin: string;
  context: string;
  onRate: (rating: Rating) => void;
  disabled?: boolean;
}

export function ReviewStep3({ word, pinyin, context, onRate, disabled }: ReviewStep3Props) {
  return (
    <div className="flex flex-col gap-8 py-8">
      <div className="flex flex-col items-center gap-4">
        <div className="text-center text-6xl font-semibold tracking-tight">{word}</div>
        <div className="text-center text-2xl text-muted-foreground">{pinyin}</div>
      </div>
      <div className="rounded-md bg-muted px-4 py-3 text-base leading-relaxed">
        {renderBold(context)}
      </div>
      <RatingButtons onRate={onRate} disabled={disabled} />
    </div>
  );
}
