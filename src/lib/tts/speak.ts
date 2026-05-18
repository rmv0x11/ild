// Dead-simple Web Speech wrapper — the exact shape we shipped in the first
// iteration of the project (when the user reported it working). Every layer
// we added on top of this turned out to be a regression vector, so we are
// keeping it deliberately bare.
//
// The only modern wart is the SpeakResult return type: callers downstream
// (ReviewStep2 UI, tests) read `spoke` / `errorType` to surface state to the
// user. Promise<void> would simplify this file further but would force a
// ripple of edits across every consumer for no real benefit.

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

/** Kept for backwards-compat with main.tsx import. No-op besides voice prefetch. */
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

export function speakChinese(text: string): Promise<SpeakResult> {
  if (!isTtsAvailable()) {
    return new Promise((resolve) => {
      setTimeout(() => resolve({ spoke: false, voice: null }), 800);
    });
  }

  ensureVoicesListener();

  return new Promise((resolve) => {
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'zh-CN';
      utterance.rate = 0.9;
      const voice = getChineseVoice();
      if (voice) {
        utterance.voice = voice;
      }
      utterance.onend = () =>
        resolve({ spoke: true, voice: getChineseVoiceInfo() });
      utterance.onerror = (event) => {
        const ev = event as SpeechSynthesisErrorEvent;
        resolve({
          spoke: false,
          errorType: ev.error ?? 'unknown',
          voice: getChineseVoiceInfo(),
        });
      };
      window.speechSynthesis.speak(utterance);
    } catch (err) {
      resolve({
        spoke: false,
        errorType: err instanceof Error ? err.name : 'threw',
        voice: getChineseVoiceInfo(),
      });
    }
  });
}
