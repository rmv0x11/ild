// Web Speech API provider — the exact, deliberately-bare implementation that we
// shipped in the first iteration (when the user confirmed it working). Every
// layer added on top of this turned out to be a regression vector, so it is kept
// minimal on purpose. On native platforms this path is not used at all (see
// ./native and ./speak): window.speechSynthesis is unsupported in the Android
// System WebView and flaky/gesture-gated in iOS WKWebView, which is exactly why
// the native build routes through the Capacitor plugin instead.

import type { VoiceInfo } from './types';
import type { SpeakResult } from './types';
import { getSelectedVoiceURI } from './selection';
import { notifyVoicesChanged } from './selection';

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

function readChineseVoices(): SpeechSynthesisVoice[] {
  if (!isAvailable()) return [];
  ensureVoicesListener();
  if (!cachedVoices || cachedVoices.length === 0) {
    cachedVoices = window.speechSynthesis.getVoices();
  }
  if (!cachedVoices) return [];
  return cachedVoices.filter((v) => v.lang && v.lang.toLowerCase().startsWith('zh'));
}

export function getAvailableChineseVoices(): VoiceInfo[] {
  return readChineseVoices()
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
 * Raw Web Speech voice used to pin `utterance.voice`. Kept returning the actual
 * SpeechSynthesisVoice object (not VoiceInfo) because the web speak path and the
 * unit tests depend on object identity. The selection logic mirrors
 * selection.pickChineseVoice but over raw voices.
 */
export function getChineseVoice(): SpeechSynthesisVoice | null {
  const chinese = readChineseVoices();
  if (chinese.length === 0) return null;

  const selectedURI = getSelectedVoiceURI();
  if (selectedURI) {
    const found = chinese.find((v) => v.voiceURI === selectedURI);
    if (found) return found;
  }

  const zhCN = chinese.find((v) => v.lang.toLowerCase().startsWith('zh-cn'));
  return zhCN ?? chinese[0];
}

export function getChineseVoiceInfo(): VoiceInfo | null {
  const v = getChineseVoice();
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

export function speak(text: string): Promise<SpeakResult> {
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
      utterance.lang = 'zh-CN';
      utterance.rate = 0.9;
      const voice = getChineseVoice();
      if (voice) {
        utterance.voice = voice;
      }
      utterance.onend = () => resolve({ spoke: true, voice: getChineseVoiceInfo() });
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
