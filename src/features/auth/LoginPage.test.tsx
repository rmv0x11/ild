import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoginPage } from './LoginPage';

vi.mock('./api', () => ({
  requestEmailLink: vi.fn(),
  googleStartUrl: () => 'http://api.test/api/v1/auth/google/start',
  fetchMe: vi.fn(),
  logout: vi.fn(),
}));

// sonner.toast.error is invoked on network failure; we don't assert on it
// in every test but we mock so calls don't crash jsdom.
vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

import { requestEmailLink } from './api';
const requestEmailLinkMock = vi.mocked(requestEmailLink);

function renderAt(path = '/login') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <LoginPage />
    </MemoryRouter>,
  );
}

describe('LoginPage', () => {
  beforeEach(() => {
    requestEmailLinkMock.mockReset();
  });

  it('renders the title, email form and guest-mode link', () => {
    renderAt();
    expect(screen.getByText('Войти в ild')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Получить ссылку' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Гостевой режим' })).toHaveAttribute(
      'href',
      '/review',
    );
  });

  it('submits the email and switches to the "sent" state', async () => {
    requestEmailLinkMock.mockResolvedValueOnce(undefined);
    const user = userEvent.setup();
    renderAt();

    await user.type(screen.getByLabelText('Email'), 'you@example.com');
    await user.click(screen.getByRole('button', { name: 'Получить ссылку' }));

    await screen.findByText(/Письмо отправлено на you@example.com/);
    expect(requestEmailLinkMock).toHaveBeenCalledWith('you@example.com');

    // Form is gone; reset button is present.
    expect(screen.queryByRole('button', { name: 'Получить ссылку' })).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Попробовать другой email' }),
    ).toBeInTheDocument();
  });

  it('"Попробовать другой email" returns the form', async () => {
    requestEmailLinkMock.mockResolvedValueOnce(undefined);
    const user = userEvent.setup();
    renderAt();

    await user.type(screen.getByLabelText('Email'), 'x@y.z');
    await user.click(screen.getByRole('button', { name: 'Получить ссылку' }));
    await screen.findByText(/Письмо отправлено на x@y.z/);

    await user.click(screen.getByRole('button', { name: 'Попробовать другой email' }));

    expect(screen.getByLabelText('Email')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Получить ссылку' })).toBeInTheDocument();
  });

  it('hides the Google button when VITE_GOOGLE_ENABLED is not "true"', () => {
    // The module reads import.meta.env at evaluation time; the default test
    // env (no .env loaded) leaves VITE_GOOGLE_ENABLED undefined → hidden.
    renderAt();
    expect(screen.queryByRole('link', { name: /Google/ })).not.toBeInTheDocument();
  });
});
