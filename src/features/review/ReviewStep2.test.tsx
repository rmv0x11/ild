import { act, fireEvent, render, screen } from '@testing-library/react';
import * as ttsModule from '@/lib/tts/speak';
import { ReviewStep2 } from './ReviewStep2';

vi.mock('@/lib/tts/speak', () => ({
  isTtsAvailable: vi.fn(() => true),
  speak: vi.fn(() => Promise.resolve({ spoke: true })),
  cancelSpeech: vi.fn(),
  getAvailableVoices: vi.fn(() => []),
  getSelectedVoiceURI: vi.fn(() => null),
  setSelectedVoiceURI: vi.fn(),
  subscribeToVoicesChanged: vi.fn(() => () => {}),
  openVoiceInstallSettings: vi.fn(() => Promise.resolve()),
}));

const isTtsAvailableMock = vi.mocked(ttsModule.isTtsAvailable);
const speakMock = vi.mocked(ttsModule.speak);
const cancelSpeechMock = vi.mocked(ttsModule.cancelSpeech);
const getAvailableVoicesMock = vi.mocked(ttsModule.getAvailableVoices);
const getSelectedVoiceURIMock = vi.mocked(ttsModule.getSelectedVoiceURI);
const setSelectedVoiceURIMock = vi.mocked(ttsModule.setSelectedVoiceURI);

// Flush microtasks (so .finally on the speak promise resolves) wrapped in act
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
    speakMock.mockImplementation(() => Promise.resolve({ spoke: true }));
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the word and reading text', () => {
    render(<ReviewStep2 word="你好" reading="nǐ hǎo" lang="zh" onNext={vi.fn()} />);
    expect(screen.getByText('你好')).toBeInTheDocument();
    expect(screen.getByText('nǐ hǎo')).toBeInTheDocument();
  });

  it('does NOT auto-speak on mount (initial speak is owned by ReviewStep1.onClick to keep user-activation)', () => {
    render(<ReviewStep2 word="你好" reading="nǐ hǎo" lang="zh" onNext={vi.fn()} />);
    expect(speakMock).not.toHaveBeenCalled();
  });

  it('"Показать перевод" starts disabled', () => {
    render(<ReviewStep2 word="你好" reading="nǐ hǎo" lang="zh" onNext={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Показать перевод' })).toBeDisabled();
  });

  it('enables "Показать перевод" once TTS resolves and the 800ms min-delay elapses', async () => {
    render(<ReviewStep2 word="你好" reading="nǐ hǎo" lang="zh" onNext={vi.fn()} />);
    // let the speak promise resolve into the .finally(setIsSpeaking(false))
    await flushPromises();
    // advance past MIN_DELAY_MS (800ms)
    await act(async () => {
      vi.advanceTimersByTime(900);
    });
    expect(screen.getByRole('button', { name: 'Показать перевод' })).toBeEnabled();
  });

  it('clicking the enabled "Показать перевод" calls onNext', async () => {
    const onNext = vi.fn();
    render(<ReviewStep2 word="你好" reading="nǐ hǎo" lang="zh" onNext={onNext} />);
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

  it('"Повторить озвучку" calls speak with the word and language on click', async () => {
    render(<ReviewStep2 word="你好" reading="nǐ hǎo" lang="zh" onNext={vi.fn()} />);
    // No auto-speak on mount any more — initial speak is done by ReviewStep1.
    expect(speakMock).not.toHaveBeenCalled();
    await flushPromises();

    const replay = screen.getByRole('button', { name: 'Повторить озвучку' });
    fireEvent.click(replay);
    expect(speakMock).toHaveBeenCalledTimes(1);
    expect(speakMock).toHaveBeenLastCalledWith('你好', 'zh');
  });

  it('does not call speak on mount when TTS is unavailable but still enables advance after 800ms', async () => {
    isTtsAvailableMock.mockReturnValue(false);
    render(<ReviewStep2 word="你好" reading="nǐ hǎo" lang="zh" onNext={vi.fn()} />);
    expect(speakMock).not.toHaveBeenCalled();
    // initial state: ttsAvailable=false => isSpeaking starts false, but ttsFinished is false until timer fires
    expect(screen.getByRole('button', { name: 'Показать перевод' })).toBeDisabled();
    await act(async () => {
      vi.advanceTimersByTime(900);
    });
    expect(screen.getByRole('button', { name: 'Показать перевод' })).toBeEnabled();
  });

  it('calls cancelSpeech on unmount', () => {
    const { unmount } = render(
      <ReviewStep2 word="你好" reading="nǐ hǎo" lang="zh" onNext={vi.fn()} />,
    );
    expect(cancelSpeechMock).not.toHaveBeenCalled();
    unmount();
    expect(cancelSpeechMock).toHaveBeenCalledTimes(1);
  });

  it('renders the voice selector when voices are available', () => {
    getAvailableVoicesMock.mockReturnValue([
      { name: 'Tingting', lang: 'zh-CN', local: true, voiceURI: 'Tingting' },
      { name: 'Lili', lang: 'zh-CN', local: true, voiceURI: 'Lili' },
    ]);
    render(<ReviewStep2 word="你好" reading="nǐ hǎo" lang="zh" onNext={vi.fn()} />);
    const select = screen.getByRole('combobox', { name: 'Выбор голоса' });
    expect(select).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Tingting/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Lili/ })).toBeInTheDocument();
  });

  it('does NOT render the voice selector when no voices are available', () => {
    getAvailableVoicesMock.mockReturnValue([]);
    render(<ReviewStep2 word="你好" reading="nǐ hǎo" lang="zh" onNext={vi.fn()} />);
    expect(screen.queryByRole('combobox', { name: 'Выбор голоса' })).not.toBeInTheDocument();
  });

  it('changing the voice selector persists the choice via setSelectedVoiceURI', () => {
    getAvailableVoicesMock.mockReturnValue([
      { name: 'Tingting', lang: 'zh-CN', local: true, voiceURI: 'Tingting' },
      { name: 'Lili', lang: 'zh-CN', local: true, voiceURI: 'Lili' },
    ]);
    getSelectedVoiceURIMock.mockReturnValue(null);
    render(<ReviewStep2 word="你好" reading="nǐ hǎo" lang="zh" onNext={vi.fn()} />);
    const select = screen.getByRole('combobox', { name: 'Выбор голоса' }) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'Lili' } });
    expect(setSelectedVoiceURIMock).toHaveBeenLastCalledWith('zh', 'Lili');
  });
});
