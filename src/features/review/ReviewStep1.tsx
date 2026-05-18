import { Button } from '@/components/ui/button';
import { speakChinese } from '@/lib/tts/speak';

interface ReviewStep1Props {
  word: string;
  onNext: () => void;
}

export function ReviewStep1({ word, onNext }: ReviewStep1Props) {
  const handleNext = (): void => {
    // Kick off TTS synchronously inside the click handler so we keep the
    // browser's user-activation. Some Chromes drop a `speak()` issued later
    // in a useEffect when activation has already expired — that's the cause
    // of "no sound at all" on step 2. The Promise is intentionally ignored;
    // ReviewStep2 still runs its own playback as a backup.
    void speakChinese(word);
    onNext();
  };

  return (
    <div className="flex flex-col items-center gap-10 py-12">
      <div className="text-center text-7xl font-semibold tracking-tight">{word}</div>
      <Button size="lg" onClick={handleNext}>
        Показать пиньинь
      </Button>
    </div>
  );
}
