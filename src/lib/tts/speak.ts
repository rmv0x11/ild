let cachedVoices: SpeechSynthesisVoice[] | null = null;
let voicesListenerAttached = false;
let voicesReadyResolvers: Array<() => void> = [];

function ensureVoicesListener(): void {
  if (voicesListenerAttached) return;
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  voicesListenerAttached = true;
  window.speechSynthesis.addEventListener('voiceschanged', () => {
    cachedVoices = window.speechSynthesis.getVoices();
    // Wake up anyone waiting on waitForVoices().
    const queue = voicesReadyResolvers;
    voicesReadyResolvers = [];
    for (const r of queue) r();
  });
  // Try a sync read first — voices are often already cached at this point.
  const initial = window.speechSynthesis.getVoices();
  if (initial.length > 0) cachedVoices = initial;
}

export function isTtsAvailable(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

/**
 * Warm up the TTS engine on app load. Browsers on macOS occasionally drop the
 * very first speak() because the audio pipeline isn't initialised yet. By
 * speaking an empty utterance and immediately cancelling, we force the engine
 * to start without producing any audible output. Best-effort: silent on
 * failure, safe to call multiple times.
 */
export function warmUpTts(): void {
  if (!isTtsAvailable()) return;
  try {
    ensureVoicesListener();
    // Touch getVoices() — many browsers populate the cache only after this.
    window.speechSynthesis.getVoices();
    const u = new SpeechSynthesisUtterance('');
    u.volume = 0;
    window.speechSynthesis.speak(u);
    window.speechSynthesis.cancel();
  } catch {
    // ignored
  }
}

/**
 * Wait for `voiceschanged` if voices aren't ready yet. Resolves immediately
 * when cached voices are populated, or after `timeoutMs` regardless. Avoids
 * the "no voice picked because getVoices() returned [] on first call" race.
 */
function waitForVoices(timeoutMs = 500): Promise<void> {
  ensureVoicesListener();
  if (cachedVoices && cachedVoices.length > 0) return Promise.resolve();
  const sync = window.speechSynthesis.getVoices();
  if (sync.length > 0) {
    cachedVoices = sync;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    let done = false;
    const finish = (): void => {
      if (done) return;
      done = true;
      resolve();
    };
    voicesReadyResolvers.push(finish);
    setTimeout(finish, timeoutMs);
  });
}

// Best Chinese voice selection priority:
//   1. zh-CN  + localService=true    ← guaranteed to play
//   2. zh-*   + localService=true
//   3. zh-CN  + localService=false   ← may be silently blocked by Chrome
//   4. zh-*   + localService=false
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
const CANCEL_TO_SPEAK_GAP_MS = 50;

export interface SpeakResult {
  spoke: boolean;
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
    let timer = 0;
    const finish = (spoke: boolean): void => {
      if (done) return;
      done = true;
      if (timer) window.clearTimeout(timer);
      resolve({ spoke, errorType, voice: getChineseVoiceInfo() });
    };
    // Safety net — Chrome silently drops onend in some states.
    timer = window.setTimeout(() => finish(false), MAX_SPEAK_MS);

    void (async () => {
      try {
        await waitForVoices(500);

        const synth = window.speechSynthesis;

        // Chrome on macOS sometimes lands in a "paused" state after a long
        // idle; resume() is a no-op otherwise.
        if (synth.paused) {
          try { synth.resume(); } catch { /* ignored */ }
        }

        // Only cancel when something is actually queued. cancel() on idle
        // engines can leave them in an invisibly-broken state until the
        // next speak() — known Chrome quirk.
        const needCancel = synth.speaking || synth.pending;
        if (needCancel) {
          try { synth.cancel(); } catch { /* ignored */ }
          await new Promise((r) => setTimeout(r, CANCEL_TO_SPEAK_GAP_MS));
        }

        const voice = getChineseVoice();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'zh-CN';
        utterance.rate = 0.9;
        utterance.pitch = 1;
        utterance.volume = 1;
        // Only PIN the voice when it's a local (offline) one. For remote
        // (Siri / Google Cloud) voices we deliberately leave utterance.voice
        // null: Chrome 138+ refuses to play remote voices explicitly assigned,
        // but the browser's own fallback (driven by lang="zh-CN") will pick
        // any working engine — that's the path that "used to work" before
        // we started force-assigning voices. Best of both worlds.
        if (voice && voice.localService) {
          utterance.voice = voice;
        }
        utterance.onend = () => {
          console.log('[tts] onend', { voice: voice?.name, text });
          finish(true);
        };
        utterance.onerror = (e) => {
          const ev = e as SpeechSynthesisErrorEvent;
          errorType = ev.error ?? 'unknown';
          console.warn('[tts] onerror', {
            error: errorType,
            voice: voice?.name,
            localService: voice?.localService,
            lang: voice?.lang,
          });
          finish(false);
        };
        console.log('[tts] speak', {
          voice: voice?.name,
          localService: voice?.localService,
          lang: voice?.lang,
          text,
          paused: synth.paused,
          speaking: synth.speaking,
          pending: synth.pending,
          voicesCount: cachedVoices?.length ?? 0,
        });
        synth.speak(utterance);
      } catch (err) {
        console.warn('[tts] threw', err);
        finish(false);
      }
    })();
  });
}
