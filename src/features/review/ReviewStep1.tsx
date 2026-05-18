import { Button } from '@/components/ui/button';

interface ReviewStep1Props {
  word: string;
  onNext: () => void;
}

export function ReviewStep1({ word, onNext }: ReviewStep1Props) {
  return (
    <div className="flex flex-col items-center gap-10 py-12">
      <div className="text-center text-7xl font-semibold tracking-tight">{word}</div>
      <Button size="lg" onClick={onNext}>
        Показать пиньинь
      </Button>
    </div>
  );
}
