import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as SpeakModule from './speak';

// Force the facade onto the native code path.
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true },
}));

interface SpeakOptions {
  text: string;
  lang?: string;
  rate?: number;
  voice?: number;
  category?: string;
}

// Mock the native plugin; the facade reaches it via dynamic import in ./native.
const speakMock = vi.fn(async (_options: SpeakOptions) => {});
const stopMock = vi.fn(async () => {});
const openInstallMock = vi.fn(async () => {});
const getSupportedVoicesMock = vi.fn(async () => ({ voices: [] as PluginVoice[] }));

vi.mock('@capacitor-community/text-to-speech', () => ({
  TextToSpeech: {
    speak: speakMock,
    stop: stopMock,
    openInstall: openInstallMock,
    getSupportedVoices: getSupportedVoicesMock,
  },
}));

interface PluginVoice {
  default: boolean;
  lang: string;
  localService: boolean;
  name: string;
  voiceURI: string;
}

function voice(lang: string, name: string, localService = true): PluginVoice {
  return { default: false, lang, localService, name, voiceURI: name };
}

async function loadModule(): Promise<typeof SpeakModule> {
  vi.resetModules();
  return import('./speak');
}

describe('tts/native (facade on native platform)', () => {
  beforeEach(() => {
    speakMock.mockClear();
    stopMock.mockClear();
    openInstallMock.mockClear();
    getSupportedVoicesMock.mockReset();
    getSupportedVoicesMock.mockResolvedValue({ voices: [] });
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it('reports TTS available on native', async () => {
    const mod = await loadModule();
    expect(mod.isTtsAvailable()).toBe(true);
  });

  it('lists only zh voices, sorted local-first then alphabetically', async () => {
    getSupportedVoicesMock.mockResolvedValue({
      voices: [
        voice('en-US', 'English'),
        { ...voice('zh-CN', 'Cloud'), localService: false },
        voice('zh-CN', 'Tingting'),
        voice('zh-CN', 'Lili'),
      ],
    });
    const mod = await loadModule();
    mod.warmUpTts();
    await vi.waitFor(() => expect(mod.getAvailableVoices('zh').length).toBe(3));
    expect(mod.getAvailableVoices('zh').map((v) => v.name)).toEqual(['Lili', 'Tingting', 'Cloud']);
  });

  it('speaks with the selected voice index and its lang', async () => {
    getSupportedVoicesMock.mockResolvedValue({
      voices: [
        voice('en-US', 'English'), // index 0
        voice('zh-CN', 'Tingting'), // index 1
        voice('zh-CN', 'Lili'), // index 2
      ],
    });
    const mod = await loadModule();
    mod.warmUpTts();
    await vi.waitFor(() => expect(mod.getAvailableVoices('zh').length).toBe(2));
    mod.setSelectedVoiceURI('zh', 'Lili');

    const res = await mod.speak('你好', 'zh');
    expect(res.spoke).toBe(true);
    expect(speakMock).toHaveBeenCalledTimes(1);
    const opts = speakMock.mock.calls[0][0];
    expect(opts.text).toBe('你好');
    expect(opts.lang).toBe('zh-CN');
    expect(opts.voice).toBe(2); // Lili's original index in getSupportedVoices()
  });

  it('defaults to the first zh-CN voice when nothing is selected', async () => {
    getSupportedVoicesMock.mockResolvedValue({
      voices: [
        voice('zh-TW', 'Taiwanese'), // index 0
        voice('zh-CN', 'Tingting'), // index 1
      ],
    });
    const mod = await loadModule();
    mod.warmUpTts();
    await vi.waitFor(() => expect(mod.getAvailableVoices('zh').length).toBe(2));

    await mod.speak('你好', 'zh');
    const opts = speakMock.mock.calls[0][0];
    expect(opts.voice).toBe(1); // prefers zh-CN Tingting over zh-TW
    expect(opts.lang).toBe('zh-CN');
  });

  it('resolves spoke:false (does not reject) when the engine throws', async () => {
    getSupportedVoicesMock.mockResolvedValue({ voices: [voice('zh-CN', 'Tingting')] });
    speakMock.mockRejectedValueOnce(new Error('boom'));
    const mod = await loadModule();
    mod.warmUpTts();
    await vi.waitFor(() => expect(mod.getAvailableVoices('zh').length).toBe(1));
    await expect(mod.speak('x', 'zh')).resolves.toMatchObject({ spoke: false });
  });

  it('cancelSpeech stops the native engine', async () => {
    const mod = await loadModule();
    mod.cancelSpeech();
    await vi.waitFor(() => expect(stopMock).toHaveBeenCalledTimes(1));
  });

  it('openVoiceInstallSettings invokes the Android installer', async () => {
    const mod = await loadModule();
    await mod.openVoiceInstallSettings();
    expect(openInstallMock).toHaveBeenCalledTimes(1);
  });
});
