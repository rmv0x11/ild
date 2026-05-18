import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { clearAll } from '@/lib/storage/cards';
import { markOnboardingCompleted } from '@/features/onboarding/onboardingState';
import App from './App';

vi.mock('@/lib/tts/speak', () => ({
  isTtsAvailable: () => false,
  speakChinese: vi.fn(() => Promise.resolve()),
  cancelSpeech: vi.fn(),
}));

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

describe('App', () => {
  beforeEach(async () => {
    await clearAll();
    localStorage.clear();
    // existing route tests assume onboarding is already done
    markOnboardingCompleted();
  });

  it('redirects from / to /review (renders the review empty state)', async () => {
    renderAt('/');
    await screen.findByText('Карточек к повторению нет');
  });

  it('renders the import page at /import', async () => {
    renderAt('/import');
    await screen.findByText('Импорт колоды CSV');
  });

  it('renders the stats page at /stats', async () => {
    renderAt('/stats');
    await screen.findByText('Прогресс зрелости');
  });

  it('falls back to /review for unknown routes', async () => {
    renderAt('/garbage');
    await screen.findByText('Карточек к повторению нет');
  });
});

describe('App onboarding integration', () => {
  beforeEach(async () => {
    await clearAll();
    localStorage.clear();
  });

  it('shows the onboarding dialog on first visit and hides it after skip', async () => {
    const user = userEvent.setup();
    renderAt('/review');

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Привет!')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Пропустить' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('does not show the onboarding dialog after it was completed', () => {
    markOnboardingCompleted();
    renderAt('/review');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
