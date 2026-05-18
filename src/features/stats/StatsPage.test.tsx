import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import type { Card } from '@/types/domain';
import { db } from '@/lib/storage/db';
import { addCards, clearAll } from '@/lib/storage/cards';
import { StatsPage } from './StatsPage';

const NOW = 1_700_000_000_000;

function findTileValue(label: string): HTMLElement {
  // Tile DOM: <div>label-uppercase-css</div><div>value</div> inside a Card.
  // We locate the label element, then read its sibling's text.
  const labelEl = screen.getByText(label, { selector: 'div' });
  const valueEl = labelEl.nextElementSibling;
  if (!valueEl) throw new Error(`No sibling value for tile "${label}"`);
  return valueEl as HTMLElement;
}

describe('StatsPage', () => {
  beforeEach(async () => {
    await clearAll();
  });

  it('renders zero stats for an empty deck', async () => {
    render(<StatsPage />);

    // Wait for useLiveQuery to resolve and the "Загрузка…" placeholder to be replaced.
    await waitFor(() => {
      expect(screen.queryByText('Загрузка…')).not.toBeInTheDocument();
    });

    // Maturity progress block.
    expect(screen.getByText('Прогресс зрелости')).toBeInTheDocument();
    expect(screen.getByText('Зрелые / всего')).toBeInTheDocument();
    expect(screen.getByText('0 / 0 (0.0%)')).toBeInTheDocument();

    // Each tile shows 0.
    expect(findTileValue('Всего').textContent).toBe('0');
    expect(findTileValue('Новые').textContent).toBe('0');
    expect(findTileValue('Изучение').textContent).toBe('0');
    expect(findTileValue('Молодые').textContent).toBe('0');
    expect(findTileValue('Зрелые').textContent).toBe('0');
    expect(findTileValue('Переучивание').textContent).toBe('0');
    expect(findTileValue('Сейчас к повтору').textContent).toBe('0');
    expect(findTileValue('Сегодня к повтору').textContent).toBe('0');
  });

  it('shows totals after seeding 3 new cards', async () => {
    await addCards(
      [
        { word: '你好', pinyin: 'nǐ hǎo', context: 'a' },
        { word: '谢谢', pinyin: 'xiè xie', context: 'b' },
        { word: '再见', pinyin: 'zài jiàn', context: 'c' },
      ],
      NOW,
    );

    render(<StatsPage />);

    await waitFor(() => {
      expect(findTileValue('Всего').textContent).toBe('3');
    });

    expect(findTileValue('Новые').textContent).toBe('3');
    expect(findTileValue('Зрелые').textContent).toBe('0');
    // Maturity progress shows 0 / 3 (0.0%).
    expect(screen.getByText('0 / 3 (0.0%)')).toBeInTheDocument();
  });

  it('reports a mature card in the mature tile and progress %', async () => {
    const matureCard: Card = {
      id: 'mature-1',
      word: '老',
      pinyin: 'lǎo',
      context: 'c',
      stage: 'mature',
      learningStep: 0,
      intervalDays: 30,
      ease: 2.5,
      dueAt: NOW + 30 * 24 * 60 * 60 * 1000,
      reps: 5,
      lapses: 0,
      createdAt: NOW,
      updatedAt: NOW,
    };
    await db.cards.put(matureCard);

    render(<StatsPage />);

    await waitFor(() => {
      expect(findTileValue('Зрелые').textContent).toBe('1');
    });

    expect(findTileValue('Всего').textContent).toBe('1');
    expect(screen.getByText('1 / 1 (100.0%)')).toBeInTheDocument();
  });
});
