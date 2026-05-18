import { Link } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

interface PracticeDoneScreenProps {
  count: number;
  onRestart: () => void;
}

function pluralize(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'карточка повторена';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'карточки повторены';
  return 'карточек повторено';
}

export function PracticeDoneScreen({ count, onRestart }: PracticeDoneScreenProps) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-6 py-16">
        <div className="rounded-full bg-muted p-6">
          <CheckCircle2 className="h-12 w-12 text-muted-foreground" />
        </div>
        <div className="text-lg font-medium">Тренировка завершена!</div>
        <p className="max-w-sm text-center text-sm text-muted-foreground">
          {`${count} ${pluralize(count)}`}
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button size="lg" onClick={onRestart}>
            Ещё раз
          </Button>
          <Link to="/review" className={buttonVariants({ variant: 'outline', size: 'lg' })}>
            На главную
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
