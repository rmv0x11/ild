import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as SpeakModule from './speak';

interface FakeUtterance {
  text: string;
  lang: string;
  rate: number;
  voice: SpeechSynthesisVoice | null;
  onend: (() => void) | null;
  onerror: ((ev: unknown) => void) | null;
}

interface FakeSynth {
  cancel: ReturnType<typeof vi.fn>;
  speak: ReturnType<typeof vi.fn>;
  getVoices: ReturnType<typeof vi.fn>;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
}

function makeVoice(lang: string, name = lang): SpeechSynthesisVoice {
  return {
    default: false,
    lang,
    localService: true,
    name,
    voiceURI: name,
  } as SpeechSynthesisVoice;
}

let lastUtterance: FakeUtterance | null = null;

function installSpeechMocks(opts: {
  voices?: SpeechSynthesisVoice[];
  /** if true, speechSynthesis is removed from window */
  unavailable?: boolean;
  /** what speak() should do with the utterance */
  speakBehavior?: 'endSync' | 'endMicrotask' | 'errorMicrotask' | 'noop';
}): FakeSynth | null {
  lastUtterance = null;

  if (opts.unavailable) {
    // Remove speechSynthesis from window entirely.
    // jsdom's window typically doesn't define it, but be safe.
    // @ts-expect-error -- mutating Window typing for test
    delete (globalThis.window as Window & { speechSynthesis?: unknown }).speechSynthesis;
    vi.stubGlobal('SpeechSynthesisUtterance', undefined);
    return null;
  }

  const synth: FakeSynth = {
    cancel: vi.fn(),
    getVoices: vi.fn(() => opts.voices ?? []),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    speak: vi.fn((u: FakeUtterance) => {
      lastUtterance = u;
      switch (opts.speakBehavior) {
        case 'endSync':
          u.onend?.();
          break;
        case 'endMicrotask':
          queueMicrotask(() => u.onend?.());
          break;
        case 'errorMicrotask':
          queueMicrotask(() => u.onerror?.({ error: 'boom' }));
          break;
        default:
          break;
      }
    }),
  };

  // Attach speechSynthesis to window (and globalThis for safety)
  Object.defineProperty(globalThis.window, 'speechSynthesis', {
    value: synth,
    configurable: true,
    writable: true,
  });

  class FakeUtteranceCtor implements FakeUtterance {
    text: string;
    lang = '';
    rate = 1;
    voice: SpeechSynthesisVoice | null = null;
    onend: (() => void) | null = null;
    onerror: ((ev: unknown) => void) | null = null;
    constructor(text: string) {
      this.text = text;
    }
  }
  vi.stubGlobal('SpeechSynthesisUtterance', FakeUtteranceCtor);

  return synth;
}

async function loadModule(): Promise<typeof SpeakModule> {
  vi.resetModules();
  return import('./speak');
}

describe('tts/speak', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    // Make sure speechSynthesis is reset between tests.
    try {
      // @ts-expect-error -- mutating Window typing for test
      delete (globalThis.window as Window & { speechSynthesis?: unknown }).speechSynthesis;
    } catch {
      /* noop */
    }
    lastUtterance = null;
    window.localStorage.clear();
  });

  describe('isTtsAvailable', () => {
    it('returns false when speechSynthesis is missing from window', async () => {
      installSpeechMocks({ unavailable: true });
      const mod = await loadModule();
      expect(mod.isTtsAvailable()).toBe(false);
    });

    it('returns true when speechSynthesis is present', async () => {
      installSpeechMocks({ voices: [], speakBehavior: 'noop' });
      const mod = await loadModule();
      expect(mod.isTtsAvailable()).toBe(true);
    });
  });

  // The facade exposes voice selection as VoiceInfo (getVoiceInfo). The raw
  // SpeechSynthesisVoice picker (formerly getChineseVoice) now lives in ./web as
  // getVoice(lang); here we assert the picked voice through the public facade by
  // matching on voiceURI (VoiceInfo is a fresh object, so identity checks don't
  // apply). Default language is zh, so the zh cases mirror the old behavior.
  describe('getVoiceInfo', () => {
    it('returns null when TTS is unavailable', async () => {
      installSpeechMocks({ unavailable: true });
      const mod = await loadModule();
      expect(mod.getVoiceInfo('zh')).toBeNull();
    });

    it('returns null when getVoices returns an empty list', async () => {
      installSpeechMocks({ voices: [], speakBehavior: 'noop' });
      const mod = await loadModule();
      expect(mod.getVoiceInfo('zh')).toBeNull();
    });

    it('returns the first zh-CN voice when present', async () => {
      const en = makeVoice('en-US', 'English');
      const zhCN1 = makeVoice('zh-CN', 'Mandarin 1');
      const zhCN2 = makeVoice('zh-CN', 'Mandarin 2');
      installSpeechMocks({ voices: [en, zhCN1, zhCN2], speakBehavior: 'noop' });
      const mod = await loadModule();
      expect(mod.getVoiceInfo('zh')?.voiceURI).toBe(zhCN1.voiceURI);
    });

    it('falls back to a generic zh- voice when no zh-CN is found', async () => {
      const en = makeVoice('en-US', 'English');
      const zhTW = makeVoice('zh-TW', 'Taiwanese Mandarin');
      const zhHK = makeVoice('zh-HK', 'Cantonese');
      installSpeechMocks({ voices: [en, zhTW, zhHK], speakBehavior: 'noop' });
      const mod = await loadModule();
      expect(mod.getVoiceInfo('zh')?.voiceURI).toBe(zhTW.voiceURI);
    });

    it('returns null when there are voices but none are Chinese', async () => {
      installSpeechMocks({
        voices: [makeVoice('en-US'), makeVoice('ru-RU'), makeVoice('fr-FR')],
        speakBehavior: 'noop',
      });
      const mod = await loadModule();
      expect(mod.getVoiceInfo('zh')).toBeNull();
    });

    it('picks the voice matching the requested language', async () => {
      const zhCN = makeVoice('zh-CN', 'Mandarin');
      const koKR = makeVoice('ko-KR', 'Yuna');
      installSpeechMocks({ voices: [zhCN, koKR], speakBehavior: 'noop' });
      const mod = await loadModule();
      expect(mod.getVoiceInfo('ko')?.voiceURI).toBe(koKR.voiceURI);
      expect(mod.getVoiceInfo('zh')?.voiceURI).toBe(zhCN.voiceURI);
    });

    it('honors a persisted voiceURI selection when the voice is available', async () => {
      const zhCN1 = makeVoice('zh-CN', 'Tingting');
      const zhCN2 = makeVoice('zh-CN', 'Lili');
      installSpeechMocks({ voices: [zhCN1, zhCN2], speakBehavior: 'noop' });
      window.localStorage.setItem('ild:tts:voiceURI:zh', 'Lili');
      const mod = await loadModule();
      expect(mod.getVoiceInfo('zh')?.voiceURI).toBe(zhCN2.voiceURI);
    });

    it('falls back to default selection when the persisted voiceURI is missing', async () => {
      const zhCN1 = makeVoice('zh-CN', 'Tingting');
      const zhCN2 = makeVoice('zh-CN', 'Lili');
      installSpeechMocks({ voices: [zhCN1, zhCN2], speakBehavior: 'noop' });
      window.localStorage.setItem('ild:tts:voiceURI:zh', 'Mei-Jia');
      const mod = await loadModule();
      expect(mod.getVoiceInfo('zh')?.voiceURI).toBe(zhCN1.voiceURI);
    });
  });

  describe('getAvailableVoices', () => {
    it('returns an empty list when TTS is unavailable', async () => {
      installSpeechMocks({ unavailable: true });
      const mod = await loadModule();
      expect(mod.getAvailableVoices('zh')).toEqual([]);
    });

    it('returns only Chinese voices, sorted local-first then alphabetically', async () => {
      const en = makeVoice('en-US', 'English');
      const zhCNRemote = { ...makeVoice('zh-CN', 'Cloud Mandarin'), localService: false };
      const zhCNLocalB = makeVoice('zh-CN', 'Tingting');
      const zhCNLocalA = makeVoice('zh-CN', 'Lili');
      installSpeechMocks({
        voices: [en, zhCNRemote as SpeechSynthesisVoice, zhCNLocalB, zhCNLocalA],
        speakBehavior: 'noop',
      });
      const mod = await loadModule();
      const list = mod.getAvailableVoices('zh');
      expect(list.map((v) => v.name)).toEqual(['Lili', 'Tingting', 'Cloud Mandarin']);
    });
  });

  describe('selected voice URI', () => {
    it('round-trips through localStorage', async () => {
      installSpeechMocks({ voices: [], speakBehavior: 'noop' });
      const mod = await loadModule();
      expect(mod.getSelectedVoiceURI('zh')).toBeNull();
      mod.setSelectedVoiceURI('zh', 'Tingting');
      expect(mod.getSelectedVoiceURI('zh')).toBe('Tingting');
      mod.setSelectedVoiceURI('zh', null);
      expect(mod.getSelectedVoiceURI('zh')).toBeNull();
    });

    it('keeps selections separate per language', async () => {
      installSpeechMocks({ voices: [], speakBehavior: 'noop' });
      const mod = await loadModule();
      mod.setSelectedVoiceURI('zh', 'Tingting');
      mod.setSelectedVoiceURI('ko', 'Yuna');
      expect(mod.getSelectedVoiceURI('zh')).toBe('Tingting');
      expect(mod.getSelectedVoiceURI('ko')).toBe('Yuna');
    });

    it('notifies subscribers when the selection changes', async () => {
      installSpeechMocks({ voices: [], speakBehavior: 'noop' });
      const mod = await loadModule();
      const listener = vi.fn();
      const unsubscribe = mod.subscribeToVoicesChanged(listener);
      mod.setSelectedVoiceURI('zh', 'Lili');
      expect(listener).toHaveBeenCalled();
      unsubscribe();
      listener.mockClear();
      mod.setSelectedVoiceURI('zh', 'Tingting');
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('cancelSpeech', () => {
    it('does nothing when TTS is unavailable', async () => {
      installSpeechMocks({ unavailable: true });
      const mod = await loadModule();
      // Should not throw.
      expect(() => mod.cancelSpeech()).not.toThrow();
    });

    it('calls speechSynthesis.cancel when available', async () => {
      const synth = installSpeechMocks({ voices: [], speakBehavior: 'noop' });
      const mod = await loadModule();
      mod.cancelSpeech();
      expect(synth!.cancel).toHaveBeenCalledTimes(1);
    });
  });

  describe('speak', () => {
    it('resolves (via setTimeout fallback) when TTS is unavailable', async () => {
      installSpeechMocks({ unavailable: true });
      vi.useFakeTimers();
      const mod = await loadModule();
      const p = mod.speak('你好', 'zh');
      // The fallback uses setTimeout(..., 800). Advance past it.
      await vi.advanceTimersByTimeAsync(800);
      await expect(p).resolves.toMatchObject({ spoke: false });
    });

    it('configures and speaks an utterance, resolves on onend', async () => {
      const zhCN = makeVoice('zh-CN', 'Mandarin');
      const synth = installSpeechMocks({
        voices: [zhCN],
        speakBehavior: 'endMicrotask',
      });
      const mod = await loadModule();

      await expect(mod.speak('你好', 'zh')).resolves.toMatchObject({ spoke: true });

      // cancel() is called unconditionally to wake macOS Chrome's speech
      // engine — the wake-up call is part of "the path that works".
      expect(synth!.cancel).toHaveBeenCalledTimes(1);
      expect(synth!.speak).toHaveBeenCalledTimes(1);
      expect(lastUtterance).not.toBeNull();
      expect(lastUtterance!.text).toBe('你好');
      expect(lastUtterance!.lang).toBe('zh-CN');
      expect(lastUtterance!.rate).toBe(0.9);
      // We DO pin the voice if it's local (Chrome on macOS goes silent
      // otherwise — no onend, no onerror, just nothing). Remote voices we
      // leave unset so the browser's own fallback gets picked.
      expect(lastUtterance!.voice).toBe(zhCN);
    });

    it('uses the ko-KR locale and voice when speaking Korean', async () => {
      const koKR = makeVoice('ko-KR', 'Yuna');
      installSpeechMocks({ voices: [koKR], speakBehavior: 'endMicrotask' });
      const mod = await loadModule();

      await expect(mod.speak('안녕', 'ko')).resolves.toMatchObject({ spoke: true });
      expect(lastUtterance!.text).toBe('안녕');
      expect(lastUtterance!.lang).toBe('ko-KR');
      expect(lastUtterance!.voice).toBe(koKR);
    });

    it('resolves (does not reject) when utterance.onerror is fired', async () => {
      installSpeechMocks({ voices: [], speakBehavior: 'errorMicrotask' });
      const mod = await loadModule();
      // onerror used to reject; now we always resolve so the UI can recover
      // even when the browser drops the utterance silently. spoke=false +
      // errorType lets the UI explain what went wrong.
      await expect(mod.speak('hi', 'zh')).resolves.toMatchObject({ spoke: false });
    });

    it('resolves (does not reject) when an exception is thrown synchronously while speaking', async () => {
      const synth = installSpeechMocks({ voices: [], speakBehavior: 'noop' });
      synth!.speak.mockImplementation(() => {
        throw new Error('speak failed');
      });
      const mod = await loadModule();
      await expect(mod.speak('boom', 'zh')).resolves.toMatchObject({ spoke: false });
    });

    it('does not set a voice when no Chinese voice is available', async () => {
      installSpeechMocks({ voices: [makeVoice('en-US')], speakBehavior: 'endMicrotask' });
      const mod = await loadModule();
      await expect(mod.speak('hello', 'zh')).resolves.toMatchObject({ spoke: true });
      expect(lastUtterance!.voice).toBeNull();
      expect(lastUtterance!.lang).toBe('zh-CN');
    });
  });
});
