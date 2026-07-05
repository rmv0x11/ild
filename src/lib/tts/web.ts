// Web Speech API provider — the exact, deliberately-bare implementation that we
// shipped in the first iteration (when the user confirmed it working). Every
// layer added on top of this turned out to be a regression vector, so it is kept
// minimal on purpose. On native platforms this path is not used at all (see
// ./native and ./speak): window.speechSynthesis is unsupported in the Android
// System WebView and flaky/gesture-gated in iOS WKWebView, which is exactly why
// the native build routes through the Capacitor plugin instead.

import type { Language } from '@/types/domain';
import { LANGUAGE_META } from '@/lib/lang/language';
import type { VoiceInfo } from './types';
import type { SpeakResult } from './types';
import { getSelectedVoiceURI, notifyVoicesChanged, pickVoice } from './selection';

let cachedVoices: SpeechSynthesisVoice[] | null = null;
let voicesListenerAttached = false;

export function ensureVoicesListener(): void {
  if (voicesListenerAttached) return;
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  voicesListenerAttached = true;
  window.speechSynthesis.addEventListener('voiceschanged', () => {
    cachedVoices = window.speechSynthesis.getVoices();
    notifyVoicesChanged();
  });
}

export function isAvailable(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

export function warmUp(): void {
  if (!isAvailable()) return;
  try {
    ensureVoicesListener();
    window.speechSynthesis.getVoices();
  } catch {
    /* ignored */
  }
}

function voiceToInfo(v: SpeechSynthesisVoice): VoiceInfo {
  return {
    name: v.name || v.lang,
    lang: v.lang,
    local: !!v.localService,
    voiceURI: v.voiceURI,
  };
}

function readVoices(lang: Language): SpeechSynthesisVoice[] {
  if (!isAvailable()) return [];
  ensureVoicesListener();
  if (!cachedVoices || cachedVoices.length === 0) {
    cachedVoices = window.speechSynthesis.getVoices();
  }
  if (!cachedVoices) return [];
  const prefix = LANGUAGE_META[lang].voicePrefix;
  return cachedVoices.filter((v) => v.lang && v.lang.toLowerCase().startsWith(prefix));
}

export function getAvailableVoices(lang: Language): VoiceInfo[] {
  return readVoices(lang)
    .slice()
    .sort((a, b) => {
      const la = !!a.localService;
      const lb = !!b.localService;
      if (la !== lb) return la ? -1 : 1;
      return (a.name || '').localeCompare(b.name || '');
    })
    .map(voiceToInfo);
}

/**
 * Raw Web Speech voice used to pin `utterance.voice`. Returns the actual
 * SpeechSynthesisVoice object (not VoiceInfo) because the web speak path and the
 * unit tests depend on object identity. Delegates the selected→regional→first
 * priority to the shared selection.pickVoice (same pattern as native.ts) and
 * maps the chosen VoiceInfo back to its raw voice by voiceURI.
 */
export function getVoice(lang: Language): SpeechSynthesisVoice | null {
  const voices = readVoices(lang);
  if (voices.length === 0) return null;
  const picked = pickVoice(voices.map(voiceToInfo), lang, getSelectedVoiceURI(lang));
  if (!picked) return null;
  return voices.find((v) => v.voiceURI === picked.voiceURI) ?? null;
}

export function getVoiceInfo(lang: Language): VoiceInfo | null {
  const v = getVoice(lang);
  return v ? voiceToInfo(v) : null;
}

export function cancel(): void {
  if (!isAvailable()) return;
  try {
    window.speechSynthesis.cancel();
  } catch {
    /* ignored */
  }
}

export function speak(text: string, lang: Language): Promise<SpeakResult> {
  if (!isAvailable()) {
    return new Promise((resolve) => {
      setTimeout(() => resolve({ spoke: false, voice: null }), 800);
    });
  }

  ensureVoicesListener();

  return new Promise((resolve) => {
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = LANGUAGE_META[lang].ttsLang;
      utterance.rate = 0.9;
      const voice = getVoice(lang);
      if (voice) {
        utterance.voice = voice;
      }
      utterance.onend = () => resolve({ spoke: true, voice: getVoiceInfo(lang) });
      utterance.onerror = (event) => {
        const ev = event as SpeechSynthesisErrorEvent;
        resolve({
          spoke: false,
          errorType: ev.error ?? 'unknown',
          voice: getVoiceInfo(lang),
        });
      };
      window.speechSynthesis.speak(utterance);
    } catch (err) {
      resolve({
        spoke: false,
        errorType: err instanceof Error ? err.name : 'threw',
        voice: getVoiceInfo(lang),
      });
    }
  });
}
