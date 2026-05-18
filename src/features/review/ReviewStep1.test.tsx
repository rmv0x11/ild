import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReviewStep1 } from './ReviewStep1';

describe('ReviewStep1', () => {
  it('renders the word prop text', () => {
    render(<ReviewStep1 word="你好" onNext={vi.fn()} />);
    expect(screen.getByText('你好')).toBeInTheDocument();
  });

  it('renders the "Показать пиньинь" button', () => {
    render(<ReviewStep1 word="你好" onNext={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Показать пиньинь' })).toBeInTheDocument();
  });

  it('calls onNext when the button is clicked', async () => {
    const user = userEvent.setup();
    const onNext = vi.fn();
    render(<ReviewStep1 word="你好" onNext={onNext} />);
    await user.click(screen.getByRole('button', { name: 'Показать пиньинь' }));
    expect(onNext).toHaveBeenCalledTimes(1);
  });
});
