// Native TTS provider backed by @capacitor-community/text-to-speech, which calls
// AVSpeechSynthesizer on iOS and android.speech.tts.TextToSpeech on Android.
// This is the reliable path on device: the native engines speak zh-CN offline,
// without the per-utterance user-gesture requirement that gates Web Speech in a
// WKWebView, and they actually expose a voice list (WebView getVoices() is empty
// on iOS and unimplemented on Android).
//
// The plugin is loaded lazily via dynamic import so it is never pulled into the
// web bundle. The voice list is fetched asynchronously and cached so the
// synchronous facade API (getAvailableChineseVoices) can stay synchronous; when
// the list resolves we fire notifyVoicesChanged so the UI re-reads it.

import type * as TextToSpeechPlugin from '@capacitor-community/text-to-speech';
import type { SpeakResult, VoiceInfo } from './types';
import { getSelectedVoiceURI, notifyVoicesChanged, pickChineseVoice } from './selection';

interface NativeVoice {
  info: VoiceInfo;
  /** Index into the plugin's getSupportedVoices() result — the `voice` option of speak(). */
  index: number;
}

type TtsModule = typeof TextToSpeechPlugin;

let cachedVoices: NativeVoice[] | null = null;
let refreshInFlight: Promise<void> | null = null;
let pluginPromise: Promise<TtsModule> | null = null;

function loadPlugin(): Promise<TtsModule> {
  if (!pluginPromise) {
    pluginPromise = import('@capacitor-community/text-to-speech');
  }
  return pluginPromise;
}

export function isAvailable(): boolean {
  // The native engine is always present on a Capacitor platform; the voice list
  // loads asynchronously but speak() works regardless.
  return true;
}

async function doRefresh(): Promise<void> {
  try {
    const { TextToSpeech } = await loadPlugin();
    const { voices } = await TextToSpeech.getSupportedVoices();
    const zh: NativeVoice[] = [];
    voices.forEach((v, index) => {
      if (v.lang && v.lang.toLowerCase().startsWith('zh')) {
        zh.push({
          info: {
            name: v.name || v.lang,
            lang: v.lang,
            local: v.localService !== false,
            voiceURI: v.voiceURI || v.name || `${v.lang}-${index}`,
          },
          index,
        });
      }
    });
    zh.sort((a, b) => {
      if (a.info.local !== b.info.local) return a.info.local ? -1 : 1;
      return a.info.name.localeCompare(b.info.name);
    });
    cachedVoices = zh;
  } catch {
    cachedVoices = cachedVoices ?? [];
  }
  notifyVoicesChanged();
}

function refreshVoices(): Promise<void> {
  if (!refreshInFlight) {
    refreshInFlight = doRefresh().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

export function warmUp(): void {
  void refreshVoices();
}

export function getAvailableChineseVoices(): VoiceInfo[] {
  if (cachedVoices === null) {
    void refreshVoices();
    return [];
  }
  return cachedVoices.map((v) => v.info);
}

function resolveSelected(): NativeVoice | null {
  if (!cachedVoices || cachedVoices.length === 0) return null;
  const picked = pickChineseVoice(
    cachedVoices.map((v) => v.info),
    getSelectedVoiceURI(),
  );
  if (!picked) return null;
  return cachedVoices.find((v) => v.info.voiceURI === picked.voiceURI) ?? null;
}

export function getChineseVoiceInfo(): VoiceInfo | null {
  return resolveSelected()?.info ?? null;
}

export function cancel(): void {
  void loadPlugin()
    .then(({ TextToSpeech }) => TextToSpeech.stop())
    .catch(() => {
      /* ignored */
    });
}

export async function speak(text: string): Promise<SpeakResult> {
  try {
    const { TextToSpeech } = await loadPlugin();
    if (cachedVoices === null) await refreshVoices();
    const selected = resolveSelected();
    const options: {
      text: string;
      lang: string;
      rate: number;
      category: string;
      voice?: number;
    } = {
      text,
      // Pin to the resolved voice's own lang; fall back to zh-CN. `category:
      // playback` lets audio keep playing if the app briefly backgrounds.
      lang: selected?.info.lang ?? 'zh-CN',
      rate: 0.9,
      category: 'playback',
    };
    if (selected) options.voice = selected.index;
    await TextToSpeech.speak(options);
    return { spoke: true, voice: selected?.info ?? null };
  } catch (err) {
    return {
      spoke: false,
      errorType: err instanceof Error ? err.name : 'threw',
      voice: getChineseVoiceInfo(),
    };
  }
}

/**
 * Android only: open the system Text-to-speech settings so the user can install
 * a Mandarin voice pack when none is present. No-op equivalent on iOS (the
 * plugin's openInstall throws there, which we swallow).
 */
export async function openVoiceInstall(): Promise<void> {
  try {
    const { TextToSpeech } = await loadPlugin();
    await TextToSpeech.openInstall();
  } catch {
    /* ignored */
  }
}
