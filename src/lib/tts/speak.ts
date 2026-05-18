// Minimal Web Speech wrapper. Deliberately small — every extra layer ended
// up being a regression vector. This is essentially the first version of
// the file that the user reported working in early iterations.

let cachedVoices: SpeechSynthesisVoice[] | null = null;
let voicesListenerAttached = false;

function ensureVoicesListener(): void {
  if (voicesListenerAttached) return;
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  voicesListenerAttached = true;
  window.speechSynthesis.addEventListener('voiceschanged', () => {
    cachedVoices = window.speechSynthesis.getVoices();
  });
}

export function isTtsAvailable(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

/** No-op kept for backwards compat with main.tsx. */
export function warmUpTts(): void {
  if (!isTtsAvailable()) return;
  try {
    ensureVoicesListener();
    window.speechSynthesis.getVoices();
  } catch {
    /* ignored */
  }
}

export function getChineseVoice(): SpeechSynthesisVoice | null {
  if (!isTtsAvailable()) return null;
  ensureVoicesListener();
  if (!cachedVoices || cachedVoices.length === 0) {
    cachedVoices = window.speechSynthesis.getVoices();
  }
  if (!cachedVoices || cachedVoices.length === 0) return null;
  const chinese = cachedVoices.filter((v) => v.lang && v.lang.toLowerCase().startsWith('zh'));
  if (chinese.length === 0) return null;
  const zhCN = chinese.find((v) => v.lang.toLowerCase().startsWith('zh-cn'));
  return zhCN ?? chinese[0];
}

export interface VoiceInfo {
  name: string;
  lang: string;
  local: boolean;
}

export function getChineseVoiceInfo(): VoiceInfo | null {
  const v = getChineseVoice();
  if (!v) return null;
  return { name: v.name || v.lang, lang: v.lang, local: !!v.localService };
}

export function getChineseVoiceLabel(): string | null {
  const info = getChineseVoiceInfo();
  if (!info) return null;
  return `${info.name} (${info.lang})`;
}

export function cancelSpeech(): void {
  if (!isTtsAvailable()) return;
  try {
    window.speechSynthesis.cancel();
  } catch {
    /* ignored */
  }
}

export interface SpeakResult {
  spoke: boolean;
  errorType?: string;
  voice?: VoiceInfo | null;
}

const MAX_SPEAK_MS = 6000;

export function speakChinese(text: string): Promise<SpeakResult> {
  if (!isTtsAvailable()) {
    return new Promise((resolve) => {
      setTimeout(() => resolve({ spoke: false }), 800);
    });
  }

  ensureVoicesListener();

  return new Promise((resolve) => {
    let done = false;
    let errorType: string | undefined;
    let timer = 0;
    const finish = (spoke: boolean): void => {
      if (done) return;
      done = true;
      if (timer) window.clearTimeout(timer);
      resolve({ spoke, errorType, voice: getChineseVoiceInfo() });
    };
    timer = window.setTimeout(() => finish(false), MAX_SPEAK_MS);

    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'zh-CN';
      utterance.rate = 0.9;
      const voice = getChineseVoice();
      if (voice) utterance.voice = voice;
      utterance.onend = () => finish(true);
      utterance.onerror = (e) => {
        const ev = e as SpeechSynthesisErrorEvent;
        errorType = ev.error ?? 'unknown';
        finish(false);
      };
      window.speechSynthesis.speak(utterance);
    } catch {
      finish(false);
    }
  });
}
