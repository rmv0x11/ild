import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { addCards, clearAll } from '@/lib/storage/cards';
import { db } from '@/lib/storage/db';
import { ReviewPage } from './ReviewPage';

vi.mock('@/lib/tts/speak', () => ({
  isTtsAvailable: () => false,
  speakChinese: vi.fn(() => Promise.resolve({ spoke: true })),
  cancelSpeech: vi.fn(),
  getChineseVoiceLabel: () => null,
  getChineseVoice: () => null,
  getChineseVoiceInfo: () => null,
}));

function renderWithRouter() {
  return render(
    <MemoryRouter>
      <ReviewPage />
    </MemoryRouter>,
  );
}

describe('ReviewPage keyboard shortcuts', () => {
  beforeEach(async () => {
    await clearAll();
  });

  it('Space on step 1 advances to step 2 (pinyin becomes visible)', async () => {
    await addCards(
      [{ word: '测试', pinyin: 'cè shì', context: '**测试** ok' }],
      Date.now(),
    );

    renderWithRouter();

    // Wait for step 1 to render.
    await screen.findByRole('button', { name: 'Показать пиньинь' });
    // Pinyin not yet visible on step 1.
    expect(screen.queryByText('cè shì')).not.toBeInTheDocument();

    fireEvent.keyDown(window, { key: ' ' });

    // Step 2 reveals the pinyin text.
    await screen.findByText('cè shì');
  });

  it('Key "3" on step 3 rates the card as "good" and writes a review log', async () => {
    await addCards(
      [{ word: '测试', pinyin: 'cè shì', context: '**测试** ok' }],
      Date.now(),
    );

    const user = userEvent.setup();
    renderWithRouter();

    // Step 1 -> Step 2 via click (mirrors how a user starts).
    await user.click(await screen.findByRole('button', { name: 'Показать пиньинь' }));

    // Wait for "Показать перевод" to become enabled (TTS unavailable + 800ms min delay).
    const showTranslation = await screen.findByRole('button', { name: 'Показать перевод' });
    await waitFor(() => expect(showTranslation).not.toBeDisabled(), { timeout: 2000 });
    await user.click(showTranslation);

    // Now on step 3 — rating buttons should be visible.
    await screen.findByRole('button', { name: 'Хорошо' });

    // Press "3" to rate "good".
    fireEvent.keyDown(window, { key: '3' });

    await waitFor(async () => {
      const reviews = await db.reviews.toArray();
      expect(reviews).toHaveLength(1);
      expect(reviews[0].rating).toBe('good');
    });
  });
});
