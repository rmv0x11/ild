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

// Best Chinese voice selection priority:
//   1. zh-CN  + localService=true    ← guaranteed to play
//   2. zh-*   + localService=true
//   3. zh-CN  + localService=false   ← may be silently blocked by Chrome
//   4. zh-*   + localService=false
// Chrome 138+ refuses to play remote (Siri / Google online) voices via
// speechSynthesis to prevent network fingerprinting — so we strongly prefer
// local ones.
export function getChineseVoice(): SpeechSynthesisVoice | null {
  if (!isTtsAvailable()) return null;
  ensureVoicesListener();
  if (!cachedVoices || cachedVoices.length === 0) {
    cachedVoices = window.speechSynthesis.getVoices();
  }
  if (!cachedVoices || cachedVoices.length === 0) return null;

  const chinese = cachedVoices.filter((v) => v.lang && v.lang.toLowerCase().startsWith('zh'));
  if (chinese.length === 0) return null;

  const isZhCN = (v: SpeechSynthesisVoice): boolean => v.lang.toLowerCase().startsWith('zh-cn');
  const local = chinese.filter((v) => v.localService);

  if (local.length > 0) {
    return local.find(isZhCN) ?? local[0];
  }
  // No local Chinese voice. Return the remote one — caller can decide whether
  // to actually speak or to surface a "install local voice" UI hint.
  return chinese.find(isZhCN) ?? chinese[0];
}

// Detailed voice info for the UI — lets ReviewStep2 explain *why* nothing is
// playing (e.g. only a remote voice is available on macOS) instead of just a
// silent button.
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

// Backwards-compatible label for tests / older callers. Adds "(локальный)"
// or "(онлайн)" to clarify why audio might be silent.
export function getChineseVoiceLabel(): string | null {
  const info = getChineseVoiceInfo();
  if (!info) return null;
  const suffix = info.local ? 'локальный' : 'онлайн';
  return `${info.name} (${info.lang}) — ${suffix}`;
}

export function cancelSpeech(): void {
  if (!isTtsAvailable()) return;
  window.speechSynthesis.cancel();
}

const MAX_SPEAK_MS = 5000;

export interface SpeakResult {
  /** True when a SpeechSynthesisUtterance was dispatched. False when TTS is
   *  unavailable (or the call was swallowed by the safety timeout). */
  spoke: boolean;
  /** onerror event detail, when present. Useful for the UI to surface
   *  "no local voice / autoplay blocked" to the user. */
  errorType?: string;
  voice?: VoiceInfo | null;
}

export function speakChinese(text: string): Promise<SpeakResult> {
  if (!isTtsAvailable()) {
    return new Promise((resolve) => {
      setTimeout(() => resolve({ spoke: false }), 800);
    });
  }

  return new Promise((resolve) => {
    let done = false;
    let errorType: string | undefined;
    const finish = (spoke: boolean): void => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      resolve({ spoke, errorType, voice: getChineseVoiceInfo() });
    };
    // Hard safety net: Chrome sometimes never fires `onend` (e.g. when voices
    // aren't loaded yet, autoplay policy is restrictive, or speak silently
    // drops the utterance). Without this timeout `isSpeaking` would stay true
    // forever and lock the UI.
    const timer = window.setTimeout(() => finish(false), MAX_SPEAK_MS);
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'zh-CN';
      utterance.rate = 0.9;
      const voice = getChineseVoice();
      if (voice) {
        utterance.voice = voice;
      }
      utterance.onend = () => {
        if (import.meta.env.DEV) {
          // eslint-disable-next-line no-console
          console.debug('[tts] onend', { voice: voice?.name, text });
        }
        finish(true);
      };
      utterance.onerror = (e) => {
        const ev = e as SpeechSynthesisErrorEvent;
        errorType = ev.error ?? 'unknown';
        // Always log error — silent failures are the worst kind here.
        // eslint-disable-next-line no-console
        console.warn('[tts] onerror', {
          error: errorType,
          voice: voice?.name,
          localService: voice?.localService,
          lang: voice?.lang,
        });
        finish(false);
      };
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.debug('[tts] speak', { voice: voice?.name, localService: voice?.localService, text });
      }
      window.speechSynthesis.speak(utterance);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[tts] threw', err);
      finish(false);
    }
  });
}
