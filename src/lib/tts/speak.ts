// Public TTS facade. Keeps the exact surface the app shipped with
// (speakChinese, the voice helpers, VoiceInfo/SpeakResult) so consumers
// (ReviewStep1/2, ReviewPage, main.tsx, tests) need no changes, while routing
// to the right provider:
//
//   - web      → Web Speech API (./web) — unchanged, battle-tested path.
//   - native   → Capacitor @capacitor-community/text-to-speech (./native) —
//                AVSpeechSynthesizer / Android TextToSpeech, reliable offline
//                zh-CN, no WebView gesture limitation.
//
// Voice-selection persistence + change notifications live in ./selection and are
// shared, so the voice picker behaves identically on both.

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

export function getAvailableChineseVoices(): VoiceInfo[] {
  return isNativeTts() ? native.getAvailableChineseVoices() : web.getAvailableChineseVoices();
}

/**
 * Raw Web Speech voice — only meaningful on the web path (used to pin
 * `utterance.voice`). Returns null on native, where voices are selected by index
 * inside the provider. No app code reads this on native; kept for the web tests.
 */
export function getChineseVoice(): SpeechSynthesisVoice | null {
  return isNativeTts() ? null : web.getChineseVoice();
}

export function getChineseVoiceInfo(): VoiceInfo | null {
  return isNativeTts() ? native.getChineseVoiceInfo() : web.getChineseVoiceInfo();
}

export function getChineseVoiceLabel(): string | null {
  const info = getChineseVoiceInfo();
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

export function speakChinese(text: string): Promise<SpeakResult> {
  return isNativeTts() ? native.speak(text) : web.speak(text);
}

/**
 * Android only: open the system TTS settings so the user can install a Mandarin
 * voice pack. No-op on web/iOS. Wire into the "no Chinese voice" UI on native.
 */
export function openVoiceInstallSettings(): Promise<void> {
  return isNativeTts() ? native.openVoiceInstall() : Promise.resolve();
}
