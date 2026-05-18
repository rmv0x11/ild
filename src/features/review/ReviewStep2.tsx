import { useEffect, useRef, useState } from 'react';
import { Volume2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cancelSpeech, isTtsAvailable, speakChinese } from '@/lib/tts/speak';

interface ReviewStep2Props {
  word: string;
  pinyin: string;
  onNext: () => void;
}

const MIN_DELAY_MS = 800;

export function ReviewStep2({ word, pinyin, onNext }: ReviewStep2Props) {
  const ttsAvailable = isTtsAvailable();
  const [ttsFinished, setTtsFinished] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const minTimerRef = useRef<number | null>(null);

  const playTts = (): void => {
    setIsSpeaking(true);
    speakChinese(word).finally(() => {
      setIsSpeaking(false);
    });
  };

  useEffect(() => {
    minTimerRef.current = window.setTimeout(() => {
      setTtsFinished(true);
      minTimerRef.current = null;
    }, MIN_DELAY_MS);

    if (ttsAvailable) {
      setIsSpeaking(true);
      speakChinese(word).finally(() => {
        setIsSpeaking(false);
      });
    }

    return () => {
      if (minTimerRef.current !== null) {
        window.clearTimeout(minTimerRef.current);
        minTimerRef.current = null;
      }
      cancelSpeech();
    };
    // Mount-only: parent re-keys this component on word change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Translation gate: only the 800 ms minimum-attention timer. We intentionally
  // do NOT depend on `isSpeaking` — some Chromes silently drop the utterance
  // and never fire onend, which would otherwise lock the UI forever.
  const canAdvance = ttsFinished;

  return (
    <div className="flex flex-col items-center gap-8 py-12">
      <div className="text-center text-7xl font-semibold tracking-tight">{word}</div>
      <div className="text-center text-2xl text-muted-foreground">{pinyin}</div>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button
          variant="outline"
          size="lg"
          onClick={playTts}
          aria-label={isSpeaking ? 'Идёт озвучка…' : 'Повторить озвучку'}
          aria-busy={isSpeaking}
        >
          <Volume2 />
          {isSpeaking ? 'Озвучка…' : 'Повторить озвучку'}
        </Button>
        <Button size="lg" onClick={onNext} disabled={!canAdvance} data-step3-trigger>
          Показать перевод
        </Button>
      </div>
    </div>
  );
}
