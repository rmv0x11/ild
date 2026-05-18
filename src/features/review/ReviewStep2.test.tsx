import { act, fireEvent, render, screen } from '@testing-library/react';
import * as ttsModule from '@/lib/tts/speak';
import { ReviewStep2 } from './ReviewStep2';

vi.mock('@/lib/tts/speak', () => ({
  isTtsAvailable: vi.fn(() => true),
  speakChinese: vi.fn(() => Promise.resolve({ spoke: true })),
  cancelSpeech: vi.fn(),
  getChineseVoiceLabel: vi.fn(() => 'Mock Voice (zh-CN)'),
  getChineseVoice: vi.fn(() => null),
  getChineseVoiceInfo: vi.fn(() => null),
  getAvailableChineseVoices: vi.fn(() => []),
  getSelectedVoiceURI: vi.fn(() => null),
  setSelectedVoiceURI: vi.fn(),
  subscribeToVoicesChanged: vi.fn(() => () => {}),
}));

const isTtsAvailableMock = vi.mocked(ttsModule.isTtsAvailable);
const speakChineseMock = vi.mocked(ttsModule.speakChinese);
const cancelSpeechMock = vi.mocked(ttsModule.cancelSpeech);
const getAvailableChineseVoicesMock = vi.mocked(ttsModule.getAvailableChineseVoices);
const getSelectedVoiceURIMock = vi.mocked(ttsModule.getSelectedVoiceURI);
const setSelectedVoiceURIMock = vi.mocked(ttsModule.setSelectedVoiceURI);

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
    speakChineseMock.mockImplementation(() => Promise.resolve({ spoke: true }));
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

  it('does NOT auto-speak on mount (initial speak is owned by ReviewStep1.onClick to keep user-activation)', () => {
    render(<ReviewStep2 word="你好" pinyin="nǐ hǎo" onNext={vi.fn()} />);
    expect(speakChineseMock).not.toHaveBeenCalled();
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

  it('"Повторить озвучку" calls speakChinese with the word on click', async () => {
    render(<ReviewStep2 word="你好" pinyin="nǐ hǎo" onNext={vi.fn()} />);
    // No auto-speak on mount any more — initial speak is done by ReviewStep1.
    expect(speakChineseMock).not.toHaveBeenCalled();
    await flushPromises();

    const replay = screen.getByRole('button', { name: 'Повторить озвучку' });
    fireEvent.click(replay);
    expect(speakChineseMock).toHaveBeenCalledTimes(1);
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

  it('renders the voice selector when Chinese voices are available', () => {
    getAvailableChineseVoicesMock.mockReturnValue([
      { name: 'Tingting', lang: 'zh-CN', local: true, voiceURI: 'Tingting' },
      { name: 'Lili', lang: 'zh-CN', local: true, voiceURI: 'Lili' },
    ]);
    render(<ReviewStep2 word="你好" pinyin="nǐ hǎo" onNext={vi.fn()} />);
    const select = screen.getByRole('combobox', { name: 'Выбор голоса' });
    expect(select).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Tingting/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Lili/ })).toBeInTheDocument();
  });

  it('does NOT render the voice selector when no Chinese voices are available', () => {
    getAvailableChineseVoicesMock.mockReturnValue([]);
    render(<ReviewStep2 word="你好" pinyin="nǐ hǎo" onNext={vi.fn()} />);
    expect(screen.queryByRole('combobox', { name: 'Выбор голоса' })).not.toBeInTheDocument();
  });

  it('changing the voice selector persists the choice via setSelectedVoiceURI', () => {
    getAvailableChineseVoicesMock.mockReturnValue([
      { name: 'Tingting', lang: 'zh-CN', local: true, voiceURI: 'Tingting' },
      { name: 'Lili', lang: 'zh-CN', local: true, voiceURI: 'Lili' },
    ]);
    getSelectedVoiceURIMock.mockReturnValue(null);
    render(<ReviewStep2 word="你好" pinyin="nǐ hǎo" onNext={vi.fn()} />);
    const select = screen.getByRole('combobox', { name: 'Выбор голоса' }) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'Lili' } });
    expect(setSelectedVoiceURIMock).toHaveBeenLastCalledWith('Lili');
  });
});
