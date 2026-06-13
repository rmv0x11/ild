import { useEffect, useRef, useState } from 'react';
import { Volume2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  cancelSpeech,
  getAvailableChineseVoices,
  getSelectedVoiceURI,
  isTtsAvailable,
  openVoiceInstallSettings,
  setSelectedVoiceURI,
  speakChinese,
  subscribeToVoicesChanged,
  type VoiceInfo,
} from '@/lib/tts/speak';
import { isNativePlatform } from '@/lib/platform';

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
  const [lastErrorType, setLastErrorType] = useState<string | null>(null);
  const [voices, setVoices] = useState<VoiceInfo[]>(() =>
    ttsAvailable ? getAvailableChineseVoices() : [],
  );
  const [selectedURI, setSelectedURI] = useState<string | null>(() =>
    ttsAvailable ? getSelectedVoiceURI() : null,
  );
  const minTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!ttsAvailable) return;
    return subscribeToVoicesChanged(() => {
      setVoices(getAvailableChineseVoices());
      setSelectedURI(getSelectedVoiceURI());
    });
  }, [ttsAvailable]);

  const playTts = (): void => {
    setIsSpeaking(true);
    setLastErrorType(null);
    speakChinese(word)
      .then((res) => {
        if (res.errorType) setLastErrorType(res.errorType);
      })
      .finally(() => {
        setIsSpeaking(false);
      });
  };

  const handleVoiceChange = (uri: string): void => {
    setSelectedVoiceURI(uri || null);
  };

  useEffect(() => {
    // We deliberately do NOT call speakChinese() here. The initial playback is
    // started inside ReviewStep1.onClick (which keeps the browser's
    // user-activation token alive — critical for Chrome's autoplay rules).
    // Doing speak() both there and here used to cancel the first call, which
    // is exactly the symptom the user reported ("раньше работало, перестало").
    // The replay button below remains a legitimate user-gesture speak path.
    minTimerRef.current = window.setTimeout(() => {
      setTtsFinished(true);
      minTimerRef.current = null;
    }, MIN_DELAY_MS);

    return () => {
      if (minTimerRef.current !== null) {
        window.clearTimeout(minTimerRef.current);
        minTimerRef.current = null;
      }
      cancelSpeech();
    };
  }, []);

  const canAdvance = ttsFinished;
  const noChineseVoice = ttsAvailable && voices.length === 0;

  return (
    <div className="flex flex-col items-center gap-6 py-12">
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

      {ttsAvailable && voices.length > 0 && (
        <label className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>Голос:</span>
          <select
            aria-label="Выбор голоса"
            className="rounded border bg-background px-2 py-1 text-xs"
            value={selectedURI ?? ''}
            onChange={(e) => handleVoiceChange(e.target.value)}
          >
            <option value="">Автоматически</option>
            {voices.map((v) => (
              <option key={v.voiceURI} value={v.voiceURI}>
                {v.name} ({v.lang}){v.local ? '' : ' — облачный'}
              </option>
            ))}
          </select>
        </label>
      )}

      {!ttsAvailable && (
        <div className="text-center text-xs text-muted-foreground">
          Озвучка недоступна в этом браузере.
        </div>
      )}

      {noChineseVoice && (
        <div
          className="max-w-md rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100"
          role="status"
        >
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Китайский голос (zh-*) не найден в системе.{' '}
              {isNativePlatform()
                ? 'Установите голосовой пакет «Китайский (Mandarin)» в настройках синтеза речи.'
                : 'Установите китайский язык в настройках ОС.'}
            </span>
          </div>
          {isNativePlatform() && (
            <div className="mt-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => void openVoiceInstallSettings()}
              >
                Открыть настройки голоса
              </Button>
            </div>
          )}
        </div>
      )}

      {ttsAvailable && lastErrorType && (
        <div
          className="max-w-md rounded-md border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-100"
          role="status"
        >
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Озвучка не удалась: <code>{lastErrorType}</code>. Проверьте громкость
              системы или выберите другой голос.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
