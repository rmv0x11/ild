import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getSelectedVoiceURI,
  pickVoice,
  setSelectedVoiceURI,
  subscribeToVoicesChanged,
} from './selection';
import type { VoiceInfo } from './types';

function voice(lang: string, name = lang, local = true): VoiceInfo {
  return { name, lang, local, voiceURI: `${name}:${lang}` };
}

describe('tts voice selection', () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => window.localStorage.clear());

  it('stores the selected voice per language', () => {
    expect(getSelectedVoiceURI('zh')).toBeNull();
    expect(getSelectedVoiceURI('ko')).toBeNull();
    setSelectedVoiceURI('ko', 'ko-voice-1');
    expect(getSelectedVoiceURI('ko')).toBe('ko-voice-1');
    // Korean pick must not leak into Chinese.
    expect(getSelectedVoiceURI('zh')).toBeNull();
  });

  it('clears a language selection with null', () => {
    setSelectedVoiceURI('zh', 'x');
    setSelectedVoiceURI('zh', null);
    expect(getSelectedVoiceURI('zh')).toBeNull();
  });

  it('reads a legacy unsuffixed key as Chinese', () => {
    window.localStorage.setItem('ild:tts:voiceURI', 'legacy-zh');
    expect(getSelectedVoiceURI('zh')).toBe('legacy-zh');
    expect(getSelectedVoiceURI('ko')).toBeNull();
  });

  it('resetting Chinese to auto clears the legacy key so it cannot resurface', () => {
    window.localStorage.setItem('ild:tts:voiceURI', 'legacy-zh');
    setSelectedVoiceURI('zh', null);
    expect(getSelectedVoiceURI('zh')).toBeNull();
    expect(window.localStorage.getItem('ild:tts:voiceURI')).toBeNull();
  });

  it('choosing a Chinese voice supersedes and removes the legacy key', () => {
    window.localStorage.setItem('ild:tts:voiceURI', 'legacy-zh');
    setSelectedVoiceURI('zh', 'new-zh');
    expect(getSelectedVoiceURI('zh')).toBe('new-zh');
    expect(window.localStorage.getItem('ild:tts:voiceURI')).toBeNull();
  });

  it('notifies subscribers when the selection changes', () => {
    const listener = vi.fn();
    const unsub = subscribeToVoicesChanged(listener);
    setSelectedVoiceURI('zh', 'a');
    expect(listener).toHaveBeenCalledTimes(1);
    unsub();
  });

  describe('pickVoice', () => {
    it('returns null when there are no voices', () => {
      expect(pickVoice([], 'ko', null)).toBeNull();
    });

    it('honors an explicit selection', () => {
      const voices = [voice('ko-KR', 'A'), voice('ko-KR', 'B')];
      expect(pickVoice(voices, 'ko', 'B:ko-KR')?.name).toBe('B');
    });

    it('prefers the regional default when nothing is selected', () => {
      const voices = [voice('ko', 'generic'), voice('ko-KR', 'regional')];
      expect(pickVoice(voices, 'ko', null)?.name).toBe('regional');
      const zh = [voice('zh-TW', 'tw'), voice('zh-CN', 'cn')];
      expect(pickVoice(zh, 'zh', null)?.name).toBe('cn');
    });

    it('falls back to the first voice when no regional match exists', () => {
      const voices = [voice('ko-KP', 'north'), voice('ko', 'plain')];
      expect(pickVoice(voices, 'ko', null)?.name).toBe('north');
    });
  });
});
