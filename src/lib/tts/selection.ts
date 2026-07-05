// Voice-selection persistence and change notification, shared by the web and
// native providers. The selected voice is stored by voiceURI per language in
// localStorage so each language keeps its own preferred voice across sessions
// (best-effort — on iOS WebView storage can be evicted, which only means the
// picker falls back to "Автоматически").

import type { Language } from '@/types/domain';
import { LANGUAGE_META } from '@/lib/lang/language';
import type { VoiceInfo } from './types';

const VOICE_LS_PREFIX = 'ild:tts:voiceURI';
// The Chinese-only build stored the voice under this unsuffixed key; migrate it.
const LEGACY_ZH_KEY = 'ild:tts:voiceURI';

function keyFor(lang: Language): string {
  return `${VOICE_LS_PREFIX}:${lang}`;
}

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

export function getSelectedVoiceURI(lang: Language): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = window.localStorage.getItem(keyFor(lang));
    if (stored !== null) return stored;
    // One-time back-compat: an old Chinese-only pick lived at the unsuffixed key.
    if (lang === 'zh') return window.localStorage.getItem(LEGACY_ZH_KEY);
    return null;
  } catch {
    return null;
  }
}

export function setSelectedVoiceURI(lang: Language, uri: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (uri === null) window.localStorage.removeItem(keyFor(lang));
    else window.localStorage.setItem(keyFor(lang), uri);
    // Any explicit Chinese choice (including clearing to "auto") supersedes the
    // legacy unsuffixed key — drop it so a reset can't resurrect the old pick.
    if (lang === 'zh') window.localStorage.removeItem(LEGACY_ZH_KEY);
  } catch {
    /* ignored */
  }
  notifyVoicesChanged();
}

/**
 * Voice-selection logic shared across providers: a persisted URI wins,
 * otherwise the language's regional default (e.g. zh-CN, ko-KR), otherwise the
 * first available voice for the language. Operates on the provider-agnostic
 * VoiceInfo shape (the web provider keeps its own variant over raw
 * SpeechSynthesisVoice objects so it can pin `utterance.voice`).
 */
export function pickVoice(
  voices: VoiceInfo[],
  lang: Language,
  selectedURI: string | null,
): VoiceInfo | null {
  if (voices.length === 0) return null;
  if (selectedURI) {
    const found = voices.find((v) => v.voiceURI === selectedURI);
    if (found) return found;
  }
  const region = LANGUAGE_META[lang].ttsLang.toLowerCase();
  const regional = voices.find((v) => v.lang.toLowerCase().startsWith(region));
  return regional ?? voices[0];
}
