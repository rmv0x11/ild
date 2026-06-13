import { Capacitor } from '@capacitor/core';

/**
 * True when running inside a Capacitor native shell (iOS/Android), false on the
 * web/desktop. Used by features that have a native-specific path (file sharing,
 * opening system TTS settings, etc.).
 */
export function isNativePlatform(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}
