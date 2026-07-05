import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Card } from '@/types/domain';
import { db } from '@/lib/storage/db';
import { clearAll } from '@/lib/storage/cards';
import { CardsListPage } from './CardsListPage';

function renderPage() {
  return render(
    <MemoryRouter>
      <CardsListPage />
    </MemoryRouter>,
  );
}

const NOW = 1_700_000_000_000;

function makeCard(overrides: Partial<Card>): Card {
  return {
    id: 'c-1',
    lang: 'zh',
    word: '你好',
    pinyin: 'nǐ hǎo',
    context: 'hello world',
    stage: 'new',
    learningStep: 0,
    intervalDays: 0,
    ease: 2.5,
    dueAt: NOW,
    reps: 0,
    lapses: 0,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

describe('CardsListPage', () => {
  beforeEach(async () => {
    await clearAll();
  });

  it('shows the empty state with a link to /import when the deck is empty', async () => {
    renderPage();

    await screen.findByText('Колода пуста — загрузите CSV');
    const link = screen.getByRole('link', { name: 'Загрузить колоду' });
    expect(link).toHaveAttribute('href', '/import');
  });

  it('renders rows for all seeded cards', async () => {
    await db.cards.bulkAdd([
      makeCard({ id: 'a', word: '一', pinyin: 'yī' }),
      makeCard({ id: 'b', word: '二', pinyin: 'èr', stage: 'young' }),
      makeCard({ id: 'c', word: '三', pinyin: 'sān', stage: 'mature' }),
    ]);

    renderPage();

    await screen.findByTestId('card-row-a');
    expect(screen.getByTestId('card-row-b')).toBeInTheDocument();
    expect(screen.getByTestId('card-row-c')).toBeInTheDocument();
    // Counter shows 3
    expect(screen.getByText(/3 карточки|3 карточек|3 карточка/)).toBeInTheDocument();
  });

  it('filters by stage when a chip is selected', async () => {
    await db.cards.bulkAdd([
      makeCard({ id: 'a', word: '一', stage: 'new' }),
      makeCard({ id: 'b', word: '二', stage: 'young' }),
      makeCard({ id: 'c', word: '三', stage: 'mature' }),
    ]);

    const user = userEvent.setup();
    renderPage();
    await screen.findByTestId('card-row-a');

    await user.click(screen.getByRole('button', { name: 'Новые' }));

    await waitFor(() => {
      expect(screen.queryByTestId('card-row-b')).not.toBeInTheDocument();
    });
    expect(screen.getByTestId('card-row-a')).toBeInTheDocument();
    expect(screen.queryByTestId('card-row-c')).not.toBeInTheDocument();
  });

  it('search filters by word and pinyin', async () => {
    await db.cards.bulkAdd([
      makeCard({ id: 'a', word: '你好', pinyin: 'nǐ hǎo' }),
      makeCard({ id: 'b', word: '谢谢', pinyin: 'xiè xie' }),
    ]);

    const user = userEvent.setup();
    renderPage();
    await screen.findByTestId('card-row-a');

    const searchInput = screen.getByLabelText('Поиск');
    await user.type(searchInput, 'xie');

    await waitFor(() => {
      expect(screen.queryByTestId('card-row-a')).not.toBeInTheDocument();
    });
    expect(screen.getByTestId('card-row-b')).toBeInTheDocument();

    // Search by hieroglyph in word
    await user.clear(searchInput);
    await user.type(searchInput, '你');

    await waitFor(() => {
      expect(screen.queryByTestId('card-row-b')).not.toBeInTheDocument();
    });
    expect(screen.getByTestId('card-row-a')).toBeInTheDocument();
  });

  it('deletes a card via the confirm prompt', async () => {
    await db.cards.bulkAdd([makeCard({ id: 'a', word: '一' }), makeCard({ id: 'b', word: '二' })]);

    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderPage();

    const row = await screen.findByTestId('card-row-a');
    const deleteBtn = within(row).getByRole('button', { name: /Удалить/ });
    await user.click(deleteBtn);

    await waitFor(() => {
      expect(screen.queryByTestId('card-row-a')).not.toBeInTheDocument();
    });
    expect(screen.getByTestId('card-row-b')).toBeInTheDocument();
    expect(await db.cards.count()).toBe(1);

    confirmSpy.mockRestore();
  });

  it('cancels delete when the user declines the confirm prompt', async () => {
    await db.cards.put(makeCard({ id: 'a', word: '一' }));

    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderPage();

    const row = await screen.findByTestId('card-row-a');
    await user.click(within(row).getByRole('button', { name: /Удалить/ }));

    expect(await db.cards.count()).toBe(1);
    confirmSpy.mockRestore();
  });

  it('resets card progress via the reset button', async () => {
    await db.cards.put(
      makeCard({
        id: 'a',
        stage: 'mature',
        ease: 2.8,
        intervalDays: 50,
        reps: 7,
        lapses: 2,
      }),
    );

    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderPage();

    const row = await screen.findByTestId('card-row-a');
    await user.click(within(row).getByRole('button', { name: /Сбросить/ }));

    await waitFor(async () => {
      const c = await db.cards.get('a');
      expect(c?.stage).toBe('new');
      expect(c?.intervalDays).toBe(0);
      expect(c?.ease).toBe(2.5);
    });

    confirmSpy.mockRestore();
  });

  it('opens the edit dialog when pressing the pencil icon', async () => {
    await db.cards.put(makeCard({ id: 'a', word: '你好', pinyin: 'nǐ hǎo' }));

    const user = userEvent.setup();
    renderPage();

    const row = await screen.findByTestId('card-row-a');
    await user.click(within(row).getByRole('button', { name: /Редактировать/ }));

    expect(await screen.findByText('Редактирование карточки')).toBeInTheDocument();
  });

  it('opens the history dialog when pressing the clock icon', async () => {
    await db.cards.put(makeCard({ id: 'a', word: '你好' }));

    const user = userEvent.setup();
    renderPage();

    const row = await screen.findByTestId('card-row-a');
    await user.click(within(row).getByRole('button', { name: /История/ }));

    expect(await screen.findByText('Эта карточка ещё не оценивалась')).toBeInTheDocument();
  });

  it('resets filters when the reset button is clicked', async () => {
    await db.cards.bulkAdd([
      makeCard({ id: 'a', word: '一', stage: 'new' }),
      makeCard({ id: 'b', word: '二', stage: 'mature' }),
    ]);

    const user = userEvent.setup();
    renderPage();
    await screen.findByTestId('card-row-a');

    await user.click(screen.getByRole('button', { name: 'Новые' }));
    await waitFor(() => {
      expect(screen.queryByTestId('card-row-b')).not.toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /Сбросить фильтры/ }));

    await waitFor(() => {
      expect(screen.getByTestId('card-row-b')).toBeInTheDocument();
    });
    expect(screen.getByTestId('card-row-a')).toBeInTheDocument();
  });
});
