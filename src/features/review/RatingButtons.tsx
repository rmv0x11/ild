import type { Rating } from '@/types/domain';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface RatingButtonsProps {
  onRate: (rating: Rating) => void;
  disabled?: boolean;
}

const items: { rating: Rating; label: string; className: string }[] = [
  { rating: 'again', label: 'Заново', className: 'bg-rating-again hover:bg-rating-again/90' },
  { rating: 'hard', label: 'Плохо', className: 'bg-rating-hard hover:bg-rating-hard/90' },
  { rating: 'good', label: 'Хорошо', className: 'bg-rating-good hover:bg-rating-good/90' },
  { rating: 'easy', label: 'Отлично', className: 'bg-rating-easy hover:bg-rating-easy/90' },
];

export function RatingButtons({ onRate, disabled }: RatingButtonsProps) {
  return (
    <div className="grid grid-cols-4 gap-2">
      {items.map((item) => (
        <Button
          key={item.rating}
          size="lg"
          disabled={disabled}
          onClick={() => onRate(item.rating)}
          className={cn('h-14 text-base font-semibold text-white shadow-sm', item.className)}
        >
          {item.label}
        </Button>
      ))}
    </div>
  );
}
