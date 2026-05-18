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

// Preferred Chinese voices on macOS, in priority order. Tingting / Lili /
// Mei-Jia are the classic Apple speech voices — they actually produce audio
// in Chrome. Newer "Eddy", "Flo", "Reed", "Sandy", "Shelley" are Siri-style
// voices that Chrome (138+) registers in getVoices() but refuses to render,
// which is exactly the regression the user is hitting: Safari picks Tingting
// (works), Chrome picks Eddy first (silent). We bypass Chrome's default
// ordering by explicitly preferring the known-working names.
const PREFERRED_VOICE_NAMES = [
  'tingting',
  'ting-ting',
  '婷婷',
  'lili',
  'mei-jia',
  'meijia',
  'mei jia',
  'sin-ji',
  'sinji',
];

// Voices that ARE listed but typically don't play in Chrome — we keep them as
// last-resort fallback rather than first choice.
const DEPRIORITISED_VOICE_NAMES = [
  'eddy',
  'flo',
  'reed',
  'sandy',
  'shelley',
  'grandma',
  'grandpa',
];

function voicePriority(v: SpeechSynthesisVoice): number {
  const n = (v.name || '').toLowerCase();
  const idx = PREFERRED_VOICE_NAMES.findIndex((p) => n.includes(p));
  if (idx >= 0) return idx; // 0 .. PREFERRED.length-1
  if (DEPRIORITISED_VOICE_NAMES.some((d) => n.includes(d))) return 1000;
  return 100; // unknown but listed — neutral
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

  // Sort by:
  //   1. localService desc (local before remote)
  //   2. zh-CN before zh-* others
  //   3. voicePriority (Tingting/Lili before Eddy/Siri)
  const scored = [...chinese].sort((a, b) => {
    const localA = a.localService ? 0 : 1;
    const localB = b.localService ? 0 : 1;
    if (localA !== localB) return localA - localB;
    const zhA = a.lang.toLowerCase().startsWith('zh-cn') ? 0 : 1;
    const zhB = b.lang.toLowerCase().startsWith('zh-cn') ? 0 : 1;
    if (zhA !== zhB) return zhA - zhB;
    return voicePriority(a) - voicePriority(b);
  });
  return scored[0];
}

/**
 * List all Chinese voices the browser knows about. Used by the debug UI
 * so a user can see why a particular voice was picked (or wasn't).
 */
export function listChineseVoices(): VoiceInfo[] {
  if (!isTtsAvailable()) return [];
  ensureVoicesListener();
  if (!cachedVoices || cachedVoices.length === 0) {
    cachedVoices = window.speechSynthesis.getVoices();
  }
  if (!cachedVoices) return [];
  return cachedVoices
    .filter((v) => v.lang && v.lang.toLowerCase().startsWith('zh'))
    .map((v) => ({ name: v.name || v.lang, lang: v.lang, local: !!v.localService }));
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
