// Public TTS facade. Language-parameterized: every entry point takes a Language
// so the same picker/synthesizer serves both Chinese (zh-CN) and Korean (ko-KR).
// It routes to the right provider:
//
//   - web      → Web Speech API (./web) — the battle-tested, deliberately-bare path.
//   - native   → Capacitor @capacitor-community/text-to-speech (./native) —
//                AVSpeechSynthesizer / Android TextToSpeech, reliable offline,
//                no WebView gesture limitation.
//
// Voice-selection persistence (per language) + change notifications live in
// ./selection and are shared, so the voice picker behaves identically on both.

import type { Language } from '@/types/domain';
import type { SpeakResult, VoiceInfo } from './types';
import { isNativeTts } from './platform';
import {
  getSelectedVoiceURI,
  setSelectedVoiceURI,
  subscribeToVoicesChanged as subscribeSelection,
} from './selection';
import * as native from './native';
import * as web from './web';

export type { VoiceInfo, SpeakResult };
export { getSelectedVoiceURI, setSelectedVoiceURI };

export function isTtsAvailable(): boolean {
  return isNativeTts() ? native.isAvailable() : web.isAvailable();
}

/** Kept for backwards-compat with main.tsx import. Prefetches the voice list. */
export function warmUpTts(): void {
  if (isNativeTts()) native.warmUp();
  else web.warmUp();
}

export function getAvailableVoices(lang: Language): VoiceInfo[] {
  return isNativeTts() ? native.getAvailableVoices(lang) : web.getAvailableVoices(lang);
}

export function getVoiceInfo(lang: Language): VoiceInfo | null {
  return isNativeTts() ? native.getVoiceInfo(lang) : web.getVoiceInfo(lang);
}

export function getVoiceLabel(lang: Language): string | null {
  const info = getVoiceInfo(lang);
  if (!info) return null;
  return `${info.name} (${info.lang})`;
}

/** Subscribe to voices/selection changes. Returns an unsubscribe fn. */
export function subscribeToVoicesChanged(listener: () => void): () => void {
  // On web, make sure the speechSynthesis `voiceschanged` listener is attached
  // so async voice-list population also fires the callback.
  if (!isNativeTts()) web.ensureVoicesListener();
  return subscribeSelection(listener);
}

export function cancelSpeech(): void {
  if (isNativeTts()) native.cancel();
  else web.cancel();
}

export function speak(text: string, lang: Language): Promise<SpeakResult> {
  return isNativeTts() ? native.speak(text, lang) : web.speak(text, lang);
}

/**
 * Android only: open the system TTS settings so the user can install a voice
 * pack. No-op on web/iOS. Wire into the "no voice" UI on native.
 */
export function openVoiceInstallSettings(): Promise<void> {
  return isNativeTts() ? native.openVoiceInstall() : Promise.resolve();
}
