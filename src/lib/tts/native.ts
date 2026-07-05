// Native TTS provider backed by @capacitor-community/text-to-speech, which calls
// AVSpeechSynthesizer on iOS and android.speech.tts.TextToSpeech on Android.
// This is the reliable path on device: the native engines speak offline without
// the per-utterance user-gesture requirement that gates Web Speech in a
// WKWebView, and they actually expose a voice list (WebView getVoices() is empty
// on iOS and unimplemented on Android).
//
// The plugin is loaded lazily via dynamic import so it is never pulled into the
// web bundle. The full voice list is fetched asynchronously and cached so the
// synchronous facade API (getAvailableVoices) can stay synchronous; when the
// list resolves we fire notifyVoicesChanged so the UI re-reads it.

import type * as TextToSpeechPlugin from '@capacitor-community/text-to-speech';
import type { Language } from '@/types/domain';
import { LANGUAGE_META } from '@/lib/lang/language';
import type { SpeakResult, VoiceInfo } from './types';
import { getSelectedVoiceURI, notifyVoicesChanged, pickVoice } from './selection';

interface NativeVoice {
  info: VoiceInfo;
  /** Index into the plugin's getSupportedVoices() result — the `voice` option of speak(). */
  index: number;
}

type TtsModule = typeof TextToSpeechPlugin;

// All supported voices, cached; filtered per language on demand.
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
    const all: NativeVoice[] = [];
    voices.forEach((v, index) => {
      if (!v.lang) return;
      all.push({
        info: {
          name: v.name || v.lang,
          lang: v.lang,
          local: v.localService !== false,
          voiceURI: v.voiceURI || v.name || `${v.lang}-${index}`,
        },
        index,
      });
    });
    cachedVoices = all;
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

function voicesForLang(lang: Language): NativeVoice[] {
  if (!cachedVoices) return [];
  const prefix = LANGUAGE_META[lang].voicePrefix;
  return cachedVoices
    .filter((v) => v.info.lang.toLowerCase().startsWith(prefix))
    .sort((a, b) => {
      if (a.info.local !== b.info.local) return a.info.local ? -1 : 1;
      return a.info.name.localeCompare(b.info.name);
    });
}

export function getAvailableVoices(lang: Language): VoiceInfo[] {
  if (cachedVoices === null) {
    void refreshVoices();
    return [];
  }
  return voicesForLang(lang).map((v) => v.info);
}

function resolveSelected(lang: Language): NativeVoice | null {
  const voices = voicesForLang(lang);
  if (voices.length === 0) return null;
  const picked = pickVoice(
    voices.map((v) => v.info),
    lang,
    getSelectedVoiceURI(lang),
  );
  if (!picked) return null;
  return voices.find((v) => v.info.voiceURI === picked.voiceURI) ?? null;
}

export function getVoiceInfo(lang: Language): VoiceInfo | null {
  return resolveSelected(lang)?.info ?? null;
}

export function cancel(): void {
  void loadPlugin()
    .then(({ TextToSpeech }) => TextToSpeech.stop())
    .catch(() => {
      /* ignored */
    });
}

export async function speak(text: string, lang: Language): Promise<SpeakResult> {
  try {
    const { TextToSpeech } = await loadPlugin();
    if (cachedVoices === null) await refreshVoices();
    const selected = resolveSelected(lang);
    const options: {
      text: string;
      lang: string;
      rate: number;
      category: string;
      voice?: number;
    } = {
      text,
      // Pin to the resolved voice's own lang; fall back to the language default.
      // `category: playback` lets audio keep playing if the app briefly backgrounds.
      lang: selected?.info.lang ?? LANGUAGE_META[lang].ttsLang,
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
      voice: getVoiceInfo(lang),
    };
  }
}

/**
 * Android only: open the system Text-to-speech settings so the user can install
 * a voice pack when none is present. No-op equivalent on iOS (the plugin's
 * openInstall throws there, which we swallow).
 */
export async function openVoiceInstall(): Promise<void> {
  try {
    const { TextToSpeech } = await loadPlugin();
    await TextToSpeech.openInstall();
  } catch {
    /* ignored */
  }
}
