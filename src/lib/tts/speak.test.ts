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

  describe('getChineseVoice', () => {
    it('returns null when TTS is unavailable', async () => {
      installSpeechMocks({ unavailable: true });
      const mod = await loadModule();
      expect(mod.getChineseVoice()).toBeNull();
    });

    it('returns null when getVoices returns an empty list', async () => {
      installSpeechMocks({ voices: [], speakBehavior: 'noop' });
      const mod = await loadModule();
      expect(mod.getChineseVoice()).toBeNull();
    });

    it('returns the first zh-CN voice when present', async () => {
      const en = makeVoice('en-US', 'English');
      const zhCN1 = makeVoice('zh-CN', 'Mandarin 1');
      const zhCN2 = makeVoice('zh-CN', 'Mandarin 2');
      installSpeechMocks({ voices: [en, zhCN1, zhCN2], speakBehavior: 'noop' });
      const mod = await loadModule();
      const voice = mod.getChineseVoice();
      expect(voice).toBe(zhCN1);
    });

    it('falls back to a generic zh- voice when no zh-CN is found', async () => {
      const en = makeVoice('en-US', 'English');
      const zhTW = makeVoice('zh-TW', 'Taiwanese Mandarin');
      const zhHK = makeVoice('zh-HK', 'Cantonese');
      installSpeechMocks({ voices: [en, zhTW, zhHK], speakBehavior: 'noop' });
      const mod = await loadModule();
      const voice = mod.getChineseVoice();
      expect(voice).toBe(zhTW);
    });

    it('returns null when there are voices but none are Chinese', async () => {
      installSpeechMocks({
        voices: [makeVoice('en-US'), makeVoice('ru-RU'), makeVoice('fr-FR')],
        speakBehavior: 'noop',
      });
      const mod = await loadModule();
      expect(mod.getChineseVoice()).toBeNull();
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

  describe('speakChinese', () => {
    it('resolves (via setTimeout fallback) when TTS is unavailable', async () => {
      installSpeechMocks({ unavailable: true });
      vi.useFakeTimers();
      const mod = await loadModule();
      const p = mod.speakChinese('你好');
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

      await expect(mod.speakChinese('你好')).resolves.toMatchObject({ spoke: true });

      // cancel() is no longer unconditional — idle engines skip cancel to
      // avoid Chrome's "stuck cancelling" quirk. Idle mock => zero cancels.
      expect(synth!.cancel).not.toHaveBeenCalled();
      expect(synth!.speak).toHaveBeenCalledTimes(1);
      expect(lastUtterance).not.toBeNull();
      expect(lastUtterance!.text).toBe('你好');
      expect(lastUtterance!.lang).toBe('zh-CN');
      expect(lastUtterance!.rate).toBe(0.9);
      expect(lastUtterance!.voice).toBe(zhCN);
    });

    it('resolves (does not reject) when utterance.onerror is fired', async () => {
      installSpeechMocks({ voices: [], speakBehavior: 'errorMicrotask' });
      const mod = await loadModule();
      // onerror used to reject; now we always resolve so the UI can recover
      // even when the browser drops the utterance silently. spoke=false +
      // errorType lets the UI explain what went wrong.
      await expect(mod.speakChinese('hi')).resolves.toMatchObject({ spoke: false });
    });

    it('resolves (does not reject) when an exception is thrown synchronously while speaking', async () => {
      const synth = installSpeechMocks({ voices: [], speakBehavior: 'noop' });
      synth!.speak.mockImplementation(() => {
        throw new Error('speak failed');
      });
      const mod = await loadModule();
      await expect(mod.speakChinese('boom')).resolves.toMatchObject({ spoke: false });
    });

    it('does not set a voice when no Chinese voice is available', async () => {
      installSpeechMocks({ voices: [makeVoice('en-US')], speakBehavior: 'endMicrotask' });
      const mod = await loadModule();
      await expect(mod.speakChinese('hello')).resolves.toMatchObject({ spoke: true });
      expect(lastUtterance!.voice).toBeNull();
      expect(lastUtterance!.lang).toBe('zh-CN');
    });
  });
});
