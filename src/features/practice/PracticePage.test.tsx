import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Card } from '@/types/domain';
import { addCards, clearAll } from '@/lib/storage/cards';
import { db } from '@/lib/storage/db';
import { PracticePage } from './PracticePage';

vi.mock('@/lib/tts/speak', () => ({
  isTtsAvailable: () => false,
  speak: vi.fn(() => Promise.resolve({ spoke: true })),
  cancelSpeech: vi.fn(),
  getAvailableVoices: () => [],
  getSelectedVoiceURI: () => null,
  setSelectedVoiceURI: vi.fn(),
  subscribeToVoicesChanged: () => () => {},
  openVoiceInstallSettings: vi.fn(() => Promise.resolve()),
}));

function renderWithRouter() {
  return render(
    <MemoryRouter>
      <PracticePage />
    </MemoryRouter>,
  );
}

async function advanceCard(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(await screen.findByRole('button', { name: 'Показать пиньинь' }));
  const showTranslation = await screen.findByRole('button', { name: 'Показать перевод' });
  await waitFor(() => expect(showTranslation).not.toBeDisabled(), { timeout: 2000 });
  await user.click(showTranslation);
  const next = await screen.findByRole('button', { name: 'Дальше' });
  await user.click(next);
}

function snapshotCardsSm2(cards: Card[]) {
  // Sort to make the snapshot stable regardless of insertion order.
  return [...cards]
    .sort((a, b) => a.word.localeCompare(b.word))
    .map((c) => ({
      id: c.id,
      word: c.word,
      stage: c.stage,
      learningStep: c.learningStep,
      intervalDays: c.intervalDays,
      ease: c.ease,
      dueAt: c.dueAt,
      reps: c.reps,
      lapses: c.lapses,
    }));
}

describe('PracticePage', () => {
  beforeEach(async () => {
    await clearAll();
  });

  it('shows the empty state when there are no cards', async () => {
    renderWithRouter();
    await screen.findByText('Сначала загрузите карты');
    const link = screen.getByRole('link', { name: /Загрузить колоду/ });
    expect(link).toHaveAttribute('href', '/import');
  });

  it('renders step 1 (hieroglyph + "Показать пиньинь") with a seeded card', async () => {
    await addCards(
      [
        { word: '一', pinyin: 'yī', context: '**一** один' },
        { word: '二', pinyin: 'èr', context: '**二** два' },
        { word: '三', pinyin: 'sān', context: '**三** три' },
      ],
      Date.now(),
    );

    renderWithRouter();

    await screen.findByRole('button', { name: 'Показать пиньинь' });
    // Progress 1 / 3 — header counter has class "text-sm text-muted-foreground".
    expect(
      screen.getByText(
        (_, el) =>
          el?.classList.contains('text-sm') === true &&
          el.classList.contains('text-muted-foreground') &&
          (el.textContent ?? '').replace(/\s+/g, ' ').trim() === '1 / 3',
      ),
    ).toBeInTheDocument();
  });

  it('advances Step 1 → Step 2 → Step 3 with the "Дальше" button at the end', async () => {
    await addCards([{ word: '一', pinyin: 'yī', context: '**一** один' }], Date.now());

    const user = userEvent.setup();
    renderWithRouter();

    // Step 1
    await user.click(await screen.findByRole('button', { name: 'Показать пиньинь' }));

    // Step 2 — pinyin visible.
    await screen.findByText('yī');

    const showTranslation = await screen.findByRole('button', { name: 'Показать перевод' });
    await waitFor(() => expect(showTranslation).not.toBeDisabled(), { timeout: 2000 });
    await user.click(showTranslation);

    // Step 3 — "Дальше" present, no rating buttons.
    await screen.findByRole('button', { name: 'Дальше' });
    expect(screen.queryByRole('button', { name: 'Заново' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Хорошо' })).not.toBeInTheDocument();
  });

  it('clicking "Дальше" returns to step 1 and increments the index', async () => {
    await addCards(
      [
        { word: '一', pinyin: 'yī', context: '**一** один' },
        { word: '二', pinyin: 'èr', context: '**二** два' },
      ],
      Date.now(),
    );

    const user = userEvent.setup();
    renderWithRouter();

    await advanceCard(user);

    // Now on second card; back to step 1.
    await screen.findByRole('button', { name: 'Показать пиньинь' });
    expect(
      screen.getByText(
        (_, el) =>
          el?.classList.contains('text-sm') === true &&
          el.classList.contains('text-muted-foreground') &&
          (el.textContent ?? '').replace(/\s+/g, ' ').trim() === '2 / 2',
      ),
    ).toBeInTheDocument();
  });

  it('after going through 3 cards, shows the done screen with the count', async () => {
    await addCards(
      [
        { word: '一', pinyin: 'yī', context: '**一** один' },
        { word: '二', pinyin: 'èr', context: '**二** два' },
        { word: '三', pinyin: 'sān', context: '**三** три' },
      ],
      Date.now(),
    );

    const user = userEvent.setup();
    renderWithRouter();

    await advanceCard(user);
    await advanceCard(user);
    await advanceCard(user);

    await screen.findByText('Тренировка завершена!');
    // 3 in Russian takes the "few" plural form: "3 карточки повторены".
    expect(screen.getByText('3 карточки повторены')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ещё раз' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'На главную' })).toBeInTheDocument();
  });

  it('does NOT write to db.reviews during a full practice run', async () => {
    await addCards(
      [
        { word: '一', pinyin: 'yī', context: '**一** один' },
        { word: '二', pinyin: 'èr', context: '**二** два' },
        { word: '三', pinyin: 'sān', context: '**三** три' },
      ],
      Date.now(),
    );

    const user = userEvent.setup();
    renderWithRouter();

    await advanceCard(user);
    await advanceCard(user);
    await advanceCard(user);

    await screen.findByText('Тренировка завершена!');

    const reviewCount = await db.reviews.count();
    expect(reviewCount).toBe(0);
  });

  it('does NOT change card SM-2 fields (stage / intervalDays / ease / dueAt) during practice', async () => {
    await addCards(
      [
        { word: '一', pinyin: 'yī', context: '**一** один' },
        { word: '二', pinyin: 'èr', context: '**二** два' },
        { word: '三', pinyin: 'sān', context: '**三** три' },
      ],
      Date.now(),
    );

    const before = snapshotCardsSm2(await db.cards.toArray());

    const user = userEvent.setup();
    renderWithRouter();

    await advanceCard(user);
    await advanceCard(user);
    await advanceCard(user);

    await screen.findByText('Тренировка завершена!');

    const after = snapshotCardsSm2(await db.cards.toArray());
    expect(after).toEqual(before);
  });
});
