/**
 * Audio-file fallback for Chinese TTS.
 *
 * The Web Speech API on macOS Chrome is unreliable: Apple-side it only
 * exposes Siri-style voices (Eddy, Rocko, …) which Chrome registers in
 * getVoices() but refuses to render. So we keep speechSynthesis as the
 * preferred path (instant, no network), and fall back to streaming an mp3
 * from Google Translate's tts endpoint when speechSynthesis returns
 * silently — which it does on most macOS Chrome setups.
 *
 * The endpoint is unofficial but in heavy real-world use; for personal-scale
 * card review it's fine. If it ever stops working we can swap in our own
 * backend TTS proxy.
 */

const TTS_URL = 'https://translate.google.com/translate_tts';

export interface AudioPlayResult {
  /** True when the audio element actually started playing. */
  spoke: boolean;
  /** Browser/network error if any. */
  errorType?: string;
}

/**
 * Play `text` as Chinese via an mp3 stream. Returns when playback ends OR
 * after a hard timeout — so the caller can chain reliably.
 *
 * Must be invoked from a user gesture (click/keypress) the same as
 * speechSynthesis.speak — autoplay policies otherwise reject the play().
 */
export function playChineseAudio(text: string): Promise<AudioPlayResult> {
  if (typeof window === 'undefined' || !text || typeof Audio === 'undefined') {
    return Promise.resolve({ spoke: false });
  }
  const params = new URLSearchParams({
    ie: 'UTF-8',
    q: text,
    tl: 'zh-CN',
    client: 'tw-ob',
  });
  const url = `${TTS_URL}?${params.toString()}`;
  const audio = new Audio(url);
  audio.preload = 'auto';

  return new Promise((resolve) => {
    let done = false;
    let errorType: string | undefined;
    const finish = (spoke: boolean): void => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      audio.onended = null;
      audio.onerror = null;
      audio.oncanplaythrough = null;
      resolve({ spoke, errorType });
    };
    // 8 seconds is generous for a single word + slow network.
    const timer = window.setTimeout(() => finish(false), 8000);

    audio.onended = () => {
      console.log('[tts-audio] ended', { text });
      finish(true);
    };
    audio.onerror = () => {
      errorType = `audio:${audio.error?.code ?? 'unknown'}`;
      console.warn('[tts-audio] error', errorType, { text });
      finish(false);
    };
    audio.oncanplaythrough = () => {
      console.log('[tts-audio] canplaythrough', { text });
    };

    // In real browsers audio.play() returns a Promise; in jsdom it returns
    // undefined (no playback support). Guard against both.
    let playReturn: Promise<void> | undefined;
    try {
      playReturn = audio.play();
    } catch (err) {
      errorType = `play-threw:${err instanceof Error ? err.name : 'unknown'}`;
      finish(false);
      return;
    }
    if (playReturn && typeof playReturn.then === 'function') {
      playReturn
        .then(() => {
          console.log('[tts-audio] play() resolved', { text });
        })
        .catch((err: unknown) => {
          errorType = `play-rejected:${err instanceof Error ? err.name : 'unknown'}`;
          console.warn('[tts-audio] play() rejected', err);
          finish(false);
        });
    }
  });
}
