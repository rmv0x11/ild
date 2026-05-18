import { act, fireEvent, render, screen } from '@testing-library/react';
import * as ttsModule from '@/lib/tts/speak';
import { ReviewStep2 } from './ReviewStep2';

vi.mock('@/lib/tts/speak', () => ({
  isTtsAvailable: vi.fn(() => true),
  speakChinese: vi.fn(() => Promise.resolve()),
  cancelSpeech: vi.fn(),
}));

const isTtsAvailableMock = vi.mocked(ttsModule.isTtsAvailable);
const speakChineseMock = vi.mocked(ttsModule.speakChinese);
const cancelSpeechMock = vi.mocked(ttsModule.cancelSpeech);

// Flush microtasks (so .finally on the speakChinese promise resolves) wrapped in act
// to keep React state updates from leaking into the next assertion.
async function flushPromises(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('ReviewStep2', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isTtsAvailableMock.mockReturnValue(true);
    speakChineseMock.mockImplementation(() => Promise.resolve());
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the word and pinyin text', () => {
    render(<ReviewStep2 word="你好" pinyin="nǐ hǎo" onNext={vi.fn()} />);
    expect(screen.getByText('你好')).toBeInTheDocument();
    expect(screen.getByText('nǐ hǎo')).toBeInTheDocument();
  });

  it('on mount, calls speakChinese once with the word when TTS is available', () => {
    render(<ReviewStep2 word="你好" pinyin="nǐ hǎo" onNext={vi.fn()} />);
    expect(speakChineseMock).toHaveBeenCalledTimes(1);
    expect(speakChineseMock).toHaveBeenCalledWith('你好');
  });

  it('"Показать перевод" starts disabled', () => {
    render(<ReviewStep2 word="你好" pinyin="nǐ hǎo" onNext={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Показать перевод' })).toBeDisabled();
  });

  it('enables "Показать перевод" once TTS resolves and the 800ms min-delay elapses', async () => {
    render(<ReviewStep2 word="你好" pinyin="nǐ hǎo" onNext={vi.fn()} />);
    // let the speakChinese promise resolve into the .finally(setIsSpeaking(false))
    await flushPromises();
    // advance past MIN_DELAY_MS (800ms)
    await act(async () => {
      vi.advanceTimersByTime(900);
    });
    expect(screen.getByRole('button', { name: 'Показать перевод' })).toBeEnabled();
  });

  it('clicking the enabled "Показать перевод" calls onNext', async () => {
    const onNext = vi.fn();
    render(<ReviewStep2 word="你好" pinyin="nǐ hǎo" onNext={onNext} />);
    await flushPromises();
    await act(async () => {
      vi.advanceTimersByTime(900);
    });
    const btn = screen.getByRole('button', { name: 'Показать перевод' });
    expect(btn).toBeEnabled();
    // fireEvent.click is synchronous and plays well with fake timers
    fireEvent.click(btn);
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('"Повторить озвучку" calls speakChinese again on click', async () => {
    render(<ReviewStep2 word="你好" pinyin="nǐ hǎo" onNext={vi.fn()} />);
    // initial mount call
    expect(speakChineseMock).toHaveBeenCalledTimes(1);
    // wait for the first speak promise to settle so the button becomes enabled again
    await flushPromises();

    const replay = screen.getByRole('button', { name: 'Повторить озвучку' });
    fireEvent.click(replay);
    expect(speakChineseMock).toHaveBeenCalledTimes(2);
    expect(speakChineseMock).toHaveBeenLastCalledWith('你好');
  });

  it('does not call speakChinese on mount when TTS is unavailable but still enables advance after 800ms', async () => {
    isTtsAvailableMock.mockReturnValue(false);
    render(<ReviewStep2 word="你好" pinyin="nǐ hǎo" onNext={vi.fn()} />);
    expect(speakChineseMock).not.toHaveBeenCalled();
    // initial state: ttsAvailable=false => isSpeaking starts false, but ttsFinished is false until timer fires
    expect(screen.getByRole('button', { name: 'Показать перевод' })).toBeDisabled();
    await act(async () => {
      vi.advanceTimersByTime(900);
    });
    expect(screen.getByRole('button', { name: 'Показать перевод' })).toBeEnabled();
  });

  it('calls cancelSpeech on unmount', () => {
    const { unmount } = render(<ReviewStep2 word="你好" pinyin="nǐ hǎo" onNext={vi.fn()} />);
    expect(cancelSpeechMock).not.toHaveBeenCalled();
    unmount();
    expect(cancelSpeechMock).toHaveBeenCalledTimes(1);
  });
});
