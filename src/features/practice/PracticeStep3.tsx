import { Button } from '@/components/ui/button';
import { renderBold } from '@/features/review/markdown';

interface PracticeStep3Props {
  word: string;
  pinyin: string;
  context: string;
  onNext: () => void;
}

export function PracticeStep3({ word, pinyin, context, onNext }: PracticeStep3Props) {
  return (
    <div className="flex flex-col gap-8 py-8">
      <div className="flex flex-col items-center gap-4">
        <div className="text-center text-6xl font-semibold tracking-tight">{word}</div>
        <div className="text-center text-2xl text-muted-foreground">{pinyin}</div>
      </div>
      <div className="rounded-md bg-muted px-4 py-3 text-base leading-relaxed">
        {renderBold(context)}
      </div>
      <Button size="lg" onClick={onNext} className="h-14 text-base font-semibold">
        Дальше
      </Button>
    </div>
  );
}
