// Minimal speechSynthesis wrapper. Deliberately small — every layer we
// added on top of the raw API was a regression vector. Path that "used to
// work" was essentially: cancel → speak(utterance with lang only) → done.

let cachedVoices: SpeechSynthesisVoice[] | null = null;
let voicesListenerAttached = false;

function ensureVoicesListener(): void {
  if (voicesListenerAttached) return;
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  voicesListenerAttached = true;
  window.speechSynthesis.addEventListener('voiceschanged', () => {
    cachedVoices = window.speechSynthesis.getVoices();
  });
  const initial = window.speechSynthesis.getVoices();
  if (initial.length > 0) cachedVoices = initial;
}

export function isTtsAvailable(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

/** Best-effort warm-up to populate the voice list. Safe to call multiple times. */
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
  const isZhCN = (v: SpeechSynthesisVoice): boolean => v.lang.toLowerCase().startsWith('zh-cn');
  return chinese.find(isZhCN) ?? chinese[0];
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
  const suffix = info.local ? 'локальный' : 'онлайн';
  return `${info.name} (${info.lang}) — ${suffix}`;
}

export function cancelSpeech(): void {
  if (!isTtsAvailable()) return;
  try {
    window.speechSynthesis.cancel();
  } catch {
    /* ignored */
  }
}

const MAX_SPEAK_MS = 8000;

export interface SpeakResult {
  spoke: boolean;
  errorType?: string;
  voice?: VoiceInfo | null;
}

/**
 * Speak Chinese text. As close to the raw API as we can get:
 *   1. cancel()  — wakes up the engine on macOS Chrome and clears any
 *                  previous speech.
 *   2. speak(u)  with lang="zh-CN". We do NOT assign utterance.voice —
 *                  the browser picks the best voice for the lang itself.
 *                  This is exactly the path that worked in the first
 *                  iterations; explicit voice assignment turned out to be
 *                  the regression because Chrome 138+ refuses to play
 *                  some Apple Siri voices when pinned.
 *
 * Returns a SpeakResult so the UI can show what happened.
 */
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
      const synth = window.speechSynthesis;
      try { synth.cancel(); } catch { /* ignored */ }

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'zh-CN';
      utterance.rate = 0.9;
      utterance.pitch = 1;
      utterance.volume = 1;

      // Pin LOCAL voices explicitly. Field reports (debug screen showed
      // local: true for macOS Eddy) confirm: when we don't assign voice,
      // Chrome on macOS just sits silent — never fires onend or onerror.
      // Assigning the local voice wakes it up. Remote voices (Siri cloud)
      // we still leave unset so the browser's fallback gets a chance.
      const voice = getChineseVoice();
      if (voice && voice.localService) {
        utterance.voice = voice;
      }

      // Chrome keep-alive: long-running utterances sometimes "drop" mid-way
      // and never fire onend. Pulse pause/resume every 4 s while speaking
      // to keep the engine ticking. Cleared on finish.
      let keepAlive: number | null = null;
      const startKeepAlive = (): void => {
        keepAlive = window.setInterval(() => {
          if (synth.speaking) {
            try { synth.pause(); synth.resume(); } catch { /* ignored */ }
          } else if (keepAlive) {
            window.clearInterval(keepAlive);
            keepAlive = null;
          }
        }, 4000);
      };
      const stopKeepAlive = (): void => {
        if (keepAlive) {
          window.clearInterval(keepAlive);
          keepAlive = null;
        }
      };

      utterance.onstart = () => {
        console.log('[tts] onstart', { text });
        startKeepAlive();
      };
      utterance.onend = () => {
        console.log('[tts] onend', { text });
        stopKeepAlive();
        finish(true);
      };
      utterance.onerror = (e) => {
        const ev = e as SpeechSynthesisErrorEvent;
        errorType = ev.error ?? 'unknown';
        console.warn('[tts] onerror', { error: errorType });
        stopKeepAlive();
        finish(false);
      };

      console.log('[tts] speak', {
        text,
        voice: voice?.name,
        localService: voice?.localService,
        voicesCount: cachedVoices?.length ?? 0,
        paused: synth.paused,
        speaking: synth.speaking,
        pending: synth.pending,
      });
      synth.speak(utterance);

      // Belt and braces: some Chrome builds defer the first speak() into
      // a paused queue. Tickle resume() in the next microtask in case we
      // landed in that state.
      queueMicrotask(() => {
        try { if (synth.paused) synth.resume(); } catch { /* ignored */ }
      });
    } catch (err) {
      console.warn('[tts] threw', err);
      finish(false);
    }
  });
}
