// Voice-selection persistence and change notification, shared by the web and
// native providers. The selected voice is stored by voiceURI in localStorage so
// the choice survives across sessions (best-effort — on iOS WebView storage can
// be evicted, which only means the picker falls back to "Автоматически").

import type { VoiceInfo } from './types';

const VOICE_LS_KEY = 'ild:tts:voiceURI';

const voicesChangedListeners = new Set<() => void>();

export function notifyVoicesChanged(): void {
  for (const fn of voicesChangedListeners) {
    try {
      fn();
    } catch {
      /* ignored */
    }
  }
}

/** Subscribe to voices/selection changes. Returns an unsubscribe fn. */
export function subscribeToVoicesChanged(listener: () => void): () => void {
  voicesChangedListeners.add(listener);
  return () => {
    voicesChangedListeners.delete(listener);
  };
}

export function getSelectedVoiceURI(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(VOICE_LS_KEY);
  } catch {
    return null;
  }
}

export function setSelectedVoiceURI(uri: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (uri === null) window.localStorage.removeItem(VOICE_LS_KEY);
    else window.localStorage.setItem(VOICE_LS_KEY, uri);
  } catch {
    /* ignored */
  }
  notifyVoicesChanged();
}

/**
 * Voice-selection logic shared across providers: a persisted URI wins, otherwise
 * the first zh-CN voice, otherwise the first available zh-* voice. Operates on
 * the provider-agnostic VoiceInfo shape (the web provider keeps its own variant
 * over raw SpeechSynthesisVoice objects so it can pin `utterance.voice`).
 */
export function pickChineseVoice(
  voices: VoiceInfo[],
  selectedURI: string | null,
): VoiceInfo | null {
  if (voices.length === 0) return null;
  if (selectedURI) {
    const found = voices.find((v) => v.voiceURI === selectedURI);
    if (found) return found;
  }
  const zhCN = voices.find((v) => v.lang.toLowerCase().startsWith('zh-cn'));
  return zhCN ?? voices[0];
}
