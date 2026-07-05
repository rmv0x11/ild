import { Button } from '@/components/ui/button';
import { renderBold } from '@/features/review/markdown';

interface PracticeStep3Props {
  word: string;
  reading: string;
  context: string;
  onNext: () => void;
}

export function PracticeStep3({ word, reading, context, onNext }: PracticeStep3Props) {
  return (
    <div className="flex flex-col gap-8 py-8">
      <div className="flex flex-col items-center gap-4">
        <div className="text-center text-6xl font-semibold tracking-tight">{word}</div>
        <div className="text-muted-foreground text-center text-2xl">{reading}</div>
      </div>
      <div className="bg-muted rounded-md px-4 py-3 text-base leading-relaxed">
        {renderBold(context)}
      </div>
      <Button size="lg" onClick={onNext} className="h-14 text-base font-semibold">
        Дальше
      </Button>
    </div>
  );
}
