import { Capacitor } from '@capacitor/core';

/**
 * True when running inside a Capacitor native shell (iOS/Android), false on the
 * web. Used by the TTS facade to route to the native plugin instead of the
 * Web Speech API, which is unreliable or absent inside mobile WebViews.
 */
export function isNativeTts(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}
