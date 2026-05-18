import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RatingButtons } from './RatingButtons';

describe('RatingButtons', () => {
  it('renders all four buttons with the Russian labels', () => {
    render(<RatingButtons onRate={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Заново' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Плохо' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Хорошо' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Отлично' })).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(4);
  });

  it('clicking "Заново" calls onRate with "again"', async () => {
    const user = userEvent.setup();
    const onRate = vi.fn();
    render(<RatingButtons onRate={onRate} />);
    await user.click(screen.getByRole('button', { name: 'Заново' }));
    expect(onRate).toHaveBeenCalledTimes(1);
    expect(onRate).toHaveBeenCalledWith('again');
  });

  it('clicking "Плохо" calls onRate with "hard"', async () => {
    const user = userEvent.setup();
    const onRate = vi.fn();
    render(<RatingButtons onRate={onRate} />);
    await user.click(screen.getByRole('button', { name: 'Плохо' }));
    expect(onRate).toHaveBeenCalledWith('hard');
  });

  it('clicking "Хорошо" calls onRate with "good"', async () => {
    const user = userEvent.setup();
    const onRate = vi.fn();
    render(<RatingButtons onRate={onRate} />);
    await user.click(screen.getByRole('button', { name: 'Хорошо' }));
    expect(onRate).toHaveBeenCalledWith('good');
  });

  it('clicking "Отлично" calls onRate with "easy"', async () => {
    const user = userEvent.setup();
    const onRate = vi.fn();
    render(<RatingButtons onRate={onRate} />);
    await user.click(screen.getByRole('button', { name: 'Отлично' }));
    expect(onRate).toHaveBeenCalledWith('easy');
  });

  it('disables every button when disabled prop is true', () => {
    render(<RatingButtons onRate={vi.fn()} disabled />);
    for (const label of ['Заново', 'Плохо', 'Хорошо', 'Отлично']) {
      expect(screen.getByRole('button', { name: label })).toBeDisabled();
    }
  });

  it('each button has its own bg-rating-* class token', () => {
    render(<RatingButtons onRate={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Заново' }).className).toMatch(/bg-rating-again/);
    expect(screen.getByRole('button', { name: 'Плохо' }).className).toMatch(/bg-rating-hard/);
    expect(screen.getByRole('button', { name: 'Хорошо' }).className).toMatch(/bg-rating-good/);
    expect(screen.getByRole('button', { name: 'Отлично' }).className).toMatch(/bg-rating-easy/);
  });
});
