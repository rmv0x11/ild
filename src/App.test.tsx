import { beforeEach, describe, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import { clearAll } from '@/lib/storage/cards';
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
