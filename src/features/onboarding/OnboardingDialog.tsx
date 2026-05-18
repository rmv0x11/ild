import { useCallback, useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type OnboardingCloseAction = 'skip' | 'load-sample' | 'open-import';

export interface OnboardingDialogProps {
  open: boolean;
  onClose: (action: OnboardingCloseAction) => void;
}

type SlideIndex = 0 | 1 | 2 | 3;

interface SlideContent {
  emoji: string;
  title: string;
  subtitle?: string;
  body: React.ReactNode;
}

const SLIDES: SlideContent[] = [
  {
    emoji: '你好',
    title: 'Привет!',
    subtitle: '你好',
    body: (
      <p>
        <strong>ild</strong> — сервис изучения китайского по системе SM-2 (как в Anki). Колода
        хранится локально в вашем браузере — без регистрации и серверов.
      </p>
    ),
  },
  {
    emoji: '学',
    title: 'Карточка в трёх шагах',
    body: (
      <div className="flex flex-col gap-2">
        <p>Каждое слово показывается поэтапно:</p>
        <ol className="list-inside list-decimal space-y-1">
          <li>
            <strong>Иероглиф</strong> — вспомните значение
          </li>
          <li>
            <strong>Пиньинь + автоматическая озвучка</strong> — нельзя пропустить, нужно
            услышать тоны
          </li>
          <li>
            <strong>Перевод и контекст</strong> — проверьте себя
          </li>
        </ol>
        <p>Шаги нельзя пропустить — это и делает запоминание прочным.</p>
      </div>
    ),
  },
  {
    emoji: '间',
    title: '4 кнопки и интервалы',
    body: (
      <div className="flex flex-col gap-2">
        <p>После перевода оцените, насколько хорошо вы знали слово:</p>
        <ul className="list-inside list-disc space-y-1">
          <li>
            <strong>Заново</strong> — не вспомнили (через 1 минуту)
          </li>
          <li>
            <strong>Плохо</strong> — с трудом (5 минут)
          </li>
          <li>
            <strong>Хорошо</strong> — нормально (20 минут → 1 день → 3 дня → ...)
          </li>
          <li>
            <strong>Отлично</strong> — мгновенно (сразу 4 дня)
          </li>
        </ul>
        <p>Алгоритм SM-2 сам решит, когда показать карточку снова — от минут до года.</p>
      </div>
    ),
  },
  {
    emoji: '始',
    title: 'Поехали!',
    body: (
      <p>
        Чтобы попробовать прямо сейчас, загрузите примерную колоду из 4 слов. Или импортируйте
        свой CSV — формат описан на странице «Импорт».
      </p>
    ),
  },
];

const TOTAL_SLIDES = SLIDES.length;
const LAST_INDEX = (TOTAL_SLIDES - 1) as SlideIndex;

function nextIndex(i: SlideIndex): SlideIndex {
  return Math.min(LAST_INDEX, i + 1) as SlideIndex;
}

function prevIndex(i: SlideIndex): SlideIndex {
  return Math.max(0, i - 1) as SlideIndex;
}

export function OnboardingDialog({ open, onClose }: OnboardingDialogProps) {
  const [slide, setSlide] = useState<SlideIndex>(0);

  const handleSkip = useCallback(() => {
    onClose('skip');
  }, [onClose]);

  const handleLoadSample = useCallback(() => {
    onClose('load-sample');
  }, [onClose]);

  const handleOpenImport = useCallback(() => {
    onClose('open-import');
  }, [onClose]);

  const handleNext = useCallback(() => {
    setSlide((s) => nextIndex(s));
  }, []);

  const handleBack = useCallback(() => {
    setSlide((s) => prevIndex(s));
  }, []);

  useEffect(() => {
    if (!open) return undefined;

    const onKeyDown = (event: KeyboardEvent) => {
      switch (event.key) {
        case 'Escape':
          event.preventDefault();
          handleSkip();
          break;
        case 'ArrowRight':
          event.preventDefault();
          setSlide((s) => nextIndex(s));
          break;
        case 'ArrowLeft':
          event.preventDefault();
          setSlide((s) => prevIndex(s));
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, handleSkip]);

  if (!open) return null;

  const current = SLIDES[slide];
  const isLast = slide === LAST_INDEX;
  const isFirst = slide === 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
    >
      <div className="w-full max-w-lg rounded-lg border bg-card text-card-foreground shadow-lg">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-2" aria-label="Прогресс онбординга">
            {SLIDES.map((_, idx) => (
              <span
                key={idx}
                className={cn(
                  'h-2 w-2 rounded-full transition-colors',
                  idx === slide ? 'bg-primary' : 'bg-muted',
                )}
                data-testid={`onboarding-step-dot-${idx}`}
                data-active={idx === slide}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={handleSkip}
            aria-label="Пропустить"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X />
          </button>
        </div>

        <div
          key={slide}
          className="flex flex-col gap-4 px-6 pb-2 animate-in fade-in"
          data-testid={`onboarding-slide-${slide}`}
        >
          <div className="text-center text-5xl font-semibold tracking-tight">
            {current.emoji}
          </div>
          <h2 id="onboarding-title" className="text-2xl font-bold">
            {current.title}
          </h2>
          {current.subtitle && (
            <div className="text-lg text-muted-foreground">{current.subtitle}</div>
          )}
          <div className="text-muted-foreground">{current.body}</div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 p-6 pt-4">
          <Button variant="outline" onClick={handleBack} disabled={isFirst}>
            Назад
          </Button>
          {isLast ? (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={handleOpenImport}>
                Открыть импорт CSV
              </Button>
              <Button onClick={handleLoadSample}>Загрузить пример колоды</Button>
            </div>
          ) : (
            <Button onClick={handleNext}>Далее</Button>
          )}
        </div>
      </div>
    </div>
  );
}
