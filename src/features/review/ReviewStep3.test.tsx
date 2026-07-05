import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReviewStep3 } from './ReviewStep3';

describe('ReviewStep3', () => {
  const baseProps = {
    word: '你好',
    reading: 'nǐ hǎo',
    context: 'Привет, **你好**, как дела?',
    onRate: vi.fn(),
  };

  it('renders the word, pinyin, and plain-text portion of context (no ** markers)', () => {
    const { container } = render(<ReviewStep3 {...baseProps} onRate={vi.fn()} />);
    // word appears twice in this scenario (heading + bold inside context)
    expect(screen.getAllByText('你好').length).toBeGreaterThan(0);
    expect(screen.getByText('nǐ hǎo')).toBeInTheDocument();
    expect(container.textContent).not.toContain('**');
    expect(container.textContent).toContain('Привет,');
    expect(container.textContent).toContain('как дела?');
  });

  it('renders a <strong> element for the bold segment inside context', () => {
    const { container } = render(<ReviewStep3 {...baseProps} onRate={vi.fn()} />);
    const strong = container.querySelector('strong');
    expect(strong).not.toBeNull();
    expect(strong?.textContent).toBe('你好');
  });

  it('renders 4 rating buttons and clicking "Хорошо" invokes onRate with "good"', async () => {
    const user = userEvent.setup();
    const onRate = vi.fn();
    render(<ReviewStep3 {...baseProps} onRate={onRate} />);
    expect(screen.getByRole('button', { name: 'Заново' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Плохо' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Хорошо' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Отлично' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Хорошо' }));
    expect(onRate).toHaveBeenCalledTimes(1);
    expect(onRate).toHaveBeenCalledWith('good');
  });

  it('disables rating buttons when disabled=true (delegated assertion)', () => {
    render(<ReviewStep3 {...baseProps} onRate={vi.fn()} disabled />);
    for (const label of ['Заново', 'Плохо', 'Хорошо', 'Отлично']) {
      expect(screen.getByRole('button', { name: label })).toBeDisabled();
    }
  });
});
