import { useEffect, useRef, useState } from 'react';
import { Volume2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  cancelSpeech,
  getChineseVoiceInfo,
  isTtsAvailable,
  listChineseVoices,
  speakChinese,
} from '@/lib/tts/speak';

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
  const minTimerRef = useRef<number | null>(null);

  const [lastResult, setLastResult] = useState<{
    spoke: boolean;
    errorType?: string;
    voice?: string;
    local?: boolean;
  } | null>(null);

  const playTts = (): void => {
    setIsSpeaking(true);
    setLastErrorType(null);
    speakChinese(word)
      .then((res) => {
        if (res.errorType) setLastErrorType(res.errorType);
        setLastResult({
          spoke: res.spoke,
          errorType: res.errorType,
          voice: res.voice?.name,
          local: res.voice?.local,
        });
      })
      .finally(() => {
        setIsSpeaking(false);
      });
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
  const voiceInfo = ttsAvailable ? getChineseVoiceInfo() : null;
  const isRemoteOnly = voiceInfo !== null && !voiceInfo.local;

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

      {!ttsAvailable && (
        <div className="text-center text-xs text-muted-foreground">
          Озвучка недоступна в этом браузере.
        </div>
      )}

      {ttsAvailable && voiceInfo && voiceInfo.local && !lastErrorType && (
        <div className="text-center text-xs text-muted-foreground">
          Голос: {voiceInfo.name} ({voiceInfo.lang})
        </div>
      )}

      {ttsAvailable && voiceInfo === null && (
        <div
          className="max-w-md rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100"
          role="status"
        >
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Китайский голос (zh-*) не найден в системе. Браузер озвучит голосом по умолчанию.
              Установите китайский язык в настройках ОС.
            </span>
          </div>
        </div>
      )}

      {ttsAvailable && isRemoteOnly && (
        <div
          className="max-w-md rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100"
          role="status"
        >
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Голос «{voiceInfo!.name}» — облачный (Apple/Google), Chrome 138+
              блокирует такое озвучивание. Установите локальный китайский голос:
              <br />
              <strong>macOS:</strong> System Settings → Accessibility → Spoken Content →
              System Voice → Manage Voices → Chinese (Simplified) → выберите голос
              без значка облака («Tingting», «Lili», «Mei-Jia»), скачайте, перезагрузите
              вкладку.
            </span>
          </div>
        </div>
      )}

      {lastResult && (
        <div className="rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
          <div className="font-semibold">Последний speak:</div>
          <pre className="overflow-x-auto whitespace-pre-wrap text-[10px]">
            {JSON.stringify(lastResult, null, 2)}
          </pre>
          <div className="mt-2 font-semibold">Все zh-голоса:</div>
          <pre className="overflow-x-auto whitespace-pre-wrap text-[10px]">
            {JSON.stringify(listChineseVoices(), null, 2)}
          </pre>
        </div>
      )}

      {ttsAvailable && lastErrorType && !isRemoteOnly && (
        <div
          className="max-w-md rounded-md border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-100"
          role="status"
        >
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Озвучка не удалась: <code>{lastErrorType}</code>. Проверьте громкость
              системы, что вкладка не отключена (значок 🔇), и попробуйте «Повторить
              озвучку».
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
