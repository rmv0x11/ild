import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { addCards, clearAll } from '@/lib/storage/cards';
import { db } from '@/lib/storage/db';
import { ReviewPage } from './ReviewPage';

vi.mock('@/lib/tts/speak', () => ({
  isTtsAvailable: () => false,
  speakChinese: vi.fn(() => Promise.resolve()),
  cancelSpeech: vi.fn(),
  getChineseVoiceLabel: () => null,
  getChineseVoice: () => null,
}));

function renderWithRouter() {
  return render(
    <MemoryRouter>
      <ReviewPage />
    </MemoryRouter>,
  );
}

describe('ReviewPage', () => {
  beforeEach(async () => {
    await clearAll();
  });

  it('shows the empty state with a link to import when no cards are due', async () => {
    renderWithRouter();

    await screen.findByText('Карточек к повторению нет');
    const link = screen.getByRole('link', { name: 'Загрузить колоду' });
    expect(link).toHaveAttribute('href', '/import');
  });

  it('renders the first step (hieroglyph + Показать пиньинь) with a seeded card', async () => {
    await addCards(
      [{ word: '测试', pinyin: 'cè shì', context: '**测试** ok' }],
      Date.now(),
    );

    renderWithRouter();

    // The hieroglyph is shown on step 1.
    await screen.findByText('测试');
    expect(screen.getByRole('button', { name: 'Показать пиньинь' })).toBeInTheDocument();
    // Pinyin is not yet visible on step 1.
    expect(screen.queryByText('cè shì')).not.toBeInTheDocument();
  });

  it('advances to step 2 and shows the pinyin', async () => {
    await addCards(
      [{ word: '测试', pinyin: 'cè shì', context: '**测试** ok' }],
      Date.now(),
    );

    const user = userEvent.setup();
    renderWithRouter();

    const nextBtn = await screen.findByRole('button', { name: 'Показать пиньинь' });
    await user.click(nextBtn);

    // Step 2 reveals the pinyin.
    await screen.findByText('cè shì');
  });

  it('renders status badges including the count of new cards', async () => {
    await addCards(
      [{ word: '测试', pinyin: 'cè shì', context: '**测试** ok' }],
      Date.now(),
    );

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText(/Новых:\s*1/)).toBeInTheDocument();
    });
    expect(screen.getByText(/Сейчас:\s*1/)).toBeInTheDocument();
  });

  it('persists rating: clicking "Хорошо" through 3 steps updates the card and logs a review', async () => {
    await addCards(
      [{ word: '测试', pinyin: 'cè shì', context: '**测试** ok' }],
      Date.now(),
    );

    const user = userEvent.setup();
    renderWithRouter();

    await user.click(await screen.findByRole('button', { name: 'Показать пиньинь' }));

    const showTranslation = await screen.findByRole('button', { name: 'Показать перевод' });
    await waitFor(() => expect(showTranslation).not.toBeDisabled(), { timeout: 2000 });
    await user.click(showTranslation);

    const goodBtn = await screen.findByRole('button', { name: 'Хорошо' });
    await user.click(goodBtn);

    // After "good" on a new/learning card: stage becomes 'learning', step advanced.
    await waitFor(async () => {
      const cards = await db.cards.toArray();
      expect(cards).toHaveLength(1);
      expect(cards[0].stage).toBe('learning');
      expect(cards[0].learningStep).toBeGreaterThan(0);
    });

    // A review log was written for the rating.
    const reviews = await db.reviews.toArray();
    expect(reviews).toHaveLength(1);
    expect(reviews[0]).toMatchObject({
      cardId: expect.any(String),
      rating: 'good',
      stageBefore: 'new',
      stageAfter: 'learning',
    });
  });
});
