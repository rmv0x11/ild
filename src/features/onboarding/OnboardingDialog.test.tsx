import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OnboardingDialog } from './OnboardingDialog';

describe('OnboardingDialog', () => {
  it('renders the first slide by default', () => {
    render(<OnboardingDialog open onClose={vi.fn()} />);

    expect(screen.getByText('Привет!')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Назад' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Далее' })).toBeInTheDocument();
  });

  it('renders nothing when open=false', () => {
    const { container } = render(<OnboardingDialog open={false} onClose={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('advances to the second slide on "Далее" click', async () => {
    const user = userEvent.setup();
    render(<OnboardingDialog open onClose={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Далее' }));

    expect(screen.getByText('Карточка в трёх шагах')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Назад' })).not.toBeDisabled();
  });

  it('goes back to the previous slide on "Назад" click', async () => {
    const user = userEvent.setup();
    render(<OnboardingDialog open onClose={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Далее' }));
    expect(screen.getByText('Карточка в трёх шагах')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Назад' }));
    expect(screen.getByText('Привет!')).toBeInTheDocument();
  });

  it('shows two CTAs on the last slide and fires onClose("load-sample")', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<OnboardingDialog open onClose={onClose} />);

    const nextBtn = () => screen.getByRole('button', { name: 'Далее' });
    await user.click(nextBtn());
    await user.click(nextBtn());
    await user.click(nextBtn());

    expect(screen.getByText('Поехали!')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Далее' })).not.toBeInTheDocument();
    const loadSample = screen.getByRole('button', { name: 'Загрузить пример колоды' });
    const openImport = screen.getByRole('button', { name: 'Открыть импорт CSV' });
    expect(loadSample).toBeInTheDocument();
    expect(openImport).toBeInTheDocument();

    await user.click(loadSample);
    expect(onClose).toHaveBeenCalledWith('load-sample');
  });

  it('fires onClose("open-import") when "Открыть импорт CSV" is clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<OnboardingDialog open onClose={onClose} />);

    await user.click(screen.getByRole('button', { name: 'Далее' }));
    await user.click(screen.getByRole('button', { name: 'Далее' }));
    await user.click(screen.getByRole('button', { name: 'Далее' }));

    await user.click(screen.getByRole('button', { name: 'Открыть импорт CSV' }));
    expect(onClose).toHaveBeenCalledWith('open-import');
  });

  it('fires onClose("skip") when the X (Пропустить) button is clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<OnboardingDialog open onClose={onClose} />);

    await user.click(screen.getByRole('button', { name: 'Пропустить' }));
    expect(onClose).toHaveBeenCalledWith('skip');
  });

  it('fires onClose("skip") on Escape keydown', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<OnboardingDialog open onClose={onClose} />);

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledWith('skip');
  });

  it('advances and retreats slides with arrow keys', async () => {
    const user = userEvent.setup();
    render(<OnboardingDialog open onClose={vi.fn()} />);

    expect(screen.getByText('Привет!')).toBeInTheDocument();

    await user.keyboard('{ArrowRight}');
    expect(screen.getByText('Карточка в трёх шагах')).toBeInTheDocument();

    await user.keyboard('{ArrowRight}');
    expect(screen.getByText('4 кнопки и интервалы')).toBeInTheDocument();

    await user.keyboard('{ArrowLeft}');
    expect(screen.getByText('Карточка в трёх шагах')).toBeInTheDocument();
  });

  it('keeps the first step dot active on slide 0 and switches to dot 1 after Далее', async () => {
    const user = userEvent.setup();
    render(<OnboardingDialog open onClose={vi.fn()} />);

    expect(screen.getByTestId('onboarding-step-dot-0').dataset.active).toBe('true');
    expect(screen.getByTestId('onboarding-step-dot-1').dataset.active).toBe('false');

    await user.click(screen.getByRole('button', { name: 'Далее' }));

    expect(screen.getByTestId('onboarding-step-dot-0').dataset.active).toBe('false');
    expect(screen.getByTestId('onboarding-step-dot-1').dataset.active).toBe('true');
  });
});
