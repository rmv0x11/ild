/**
 * Tests for `LoginPage` with three tabs (magic link / password / register).
 *
 * Everything is mocked through `@/features/auth/api` so the tests never
 * hit a real backend; an additional mock of `react-router-dom`'s
 * `useNavigate` lets us assert post-success navigation without rendering
 * the entire app router.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import type * as RouterDom from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '@/lib/api/client';
import { LoginPage } from './LoginPage';
import { AuthContext, type AuthContextValue } from './authContextValue';

vi.mock('@/features/auth/api', () => ({
  fetchMe: vi.fn(() => Promise.resolve({ user: null })),
  requestEmailLink: vi.fn(() => Promise.resolve()),
  logout: vi.fn(() => Promise.resolve()),
  googleStartUrl: () => 'http://api.test/api/v1/auth/google/start',
  registerWithPassword: vi.fn(),
  loginWithPassword: vi.fn(),
}));

// sonner.toast.error is invoked on network failure; we don't assert on it
// in every test but we mock so calls don't crash jsdom.
vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

// useNavigate is the only piece of react-router-dom we need to spy on; the
// rest (MemoryRouter, Link, useSearchParams) must keep their real
// implementations or the page won't render.
const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof RouterDom>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

import {
  loginWithPassword,
  registerWithPassword,
  requestEmailLink,
} from './api';
const requestEmailLinkMock = vi.mocked(requestEmailLink);
const loginWithPasswordMock = vi.mocked(loginWithPassword);
const registerWithPasswordMock = vi.mocked(registerWithPassword);

const refreshMock = vi.fn<() => Promise<void>>(() => Promise.resolve());
const logoutMock = vi.fn<() => Promise<void>>(() => Promise.resolve());

function authValue(): AuthContextValue {
  return {
    status: 'guest',
    user: null,
    refresh: refreshMock,
    logout: logoutMock,
  };
}

function renderAt(path = '/login') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthContext.Provider value={authValue()}>
        <LoginPage />
      </AuthContext.Provider>
    </MemoryRouter>,
  );
}

const fakeUser = { id: 'u1', email: 'a@b.c', name: 'A', createdAt: 0 };

describe('LoginPage', () => {
  beforeEach(() => {
    requestEmailLinkMock.mockReset();
    loginWithPasswordMock.mockReset();
    registerWithPasswordMock.mockReset();
    refreshMock.mockReset();
    refreshMock.mockResolvedValue(undefined);
    navigateMock.mockReset();
  });

  it('renders the title, magic-link form (default tab) and guest-mode link', () => {
    renderAt();
    expect(screen.getByText('Войти в ild')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Получить ссылку' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Гостевой режим' })).toHaveAttribute(
      'href',
      '/review',
    );
  });

  it('renders all three tabs', () => {
    renderAt();
    expect(screen.getByRole('tab', { name: 'Войти по магик-ссылке' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Пароль' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Регистрация' })).toBeInTheDocument();
  });

  it('magic-link: submits the email and switches to the "sent" state', async () => {
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

  it('switches tabs and the password form replaces the magic-link form', async () => {
    const user = userEvent.setup();
    renderAt();

    await user.click(screen.getByRole('tab', { name: 'Пароль' }));

    // Magic-link "Получить ссылку" button must be gone now.
    expect(
      screen.queryByRole('button', { name: 'Получить ссылку' }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText('Email или username')).toBeInTheDocument();
    expect(screen.getByLabelText('Пароль')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Войти' })).toBeInTheDocument();
  });

  it('switching to Регистрация shows the registration form fields', async () => {
    const user = userEvent.setup();
    renderAt();

    await user.click(screen.getByRole('tab', { name: 'Регистрация' }));

    expect(screen.getByLabelText('Username')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Пароль')).toBeInTheDocument();
    expect(screen.getByLabelText('Повторите пароль')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Создать аккаунт' }),
    ).toBeInTheDocument();
  });

  it('password login: calls API, refresh and navigates to /review', async () => {
    loginWithPasswordMock.mockResolvedValueOnce(fakeUser);
    const user = userEvent.setup();
    renderAt();

    await user.click(screen.getByRole('tab', { name: 'Пароль' }));
    await user.type(screen.getByLabelText('Email или username'), 'someuser');
    await user.type(screen.getByLabelText('Пароль'), 'hunter22');
    await user.click(screen.getByRole('button', { name: 'Войти' }));

    expect(loginWithPasswordMock).toHaveBeenCalledWith('someuser', 'hunter22');
    // The promise has to resolve before refresh+navigate; awaiting click is
    // not always enough on jsdom — use a `findBy` pattern via expect with a
    // small custom poll instead.
    await vi.waitFor(() => {
      expect(refreshMock).toHaveBeenCalledTimes(1);
      expect(navigateMock).toHaveBeenCalledWith('/review', { replace: true });
    });
  });

  it('password login fail (401): shows "wrong credentials" message', async () => {
    loginWithPasswordMock.mockRejectedValueOnce(
      new ApiError(401, 'invalid', 'invalid_credentials'),
    );
    const user = userEvent.setup();
    renderAt();

    await user.click(screen.getByRole('tab', { name: 'Пароль' }));
    await user.type(screen.getByLabelText('Email или username'), 'foo');
    await user.type(screen.getByLabelText('Пароль'), 'wrongpw1');
    await user.click(screen.getByRole('button', { name: 'Войти' }));

    expect(
      await screen.findByText('Неверный email/username или пароль'),
    ).toBeInTheDocument();
    expect(refreshMock).not.toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('register: valid inputs → API called, refresh and navigate', async () => {
    registerWithPasswordMock.mockResolvedValueOnce(fakeUser);
    const user = userEvent.setup();
    renderAt();

    await user.click(screen.getByRole('tab', { name: 'Регистрация' }));

    await user.type(screen.getByLabelText('Username'), 'good_user');
    await user.type(screen.getByLabelText('Email'), 'good@example.com');
    await user.type(screen.getByLabelText('Пароль'), 'longenough');
    await user.type(screen.getByLabelText('Повторите пароль'), 'longenough');

    const submit = screen.getByRole('button', { name: 'Создать аккаунт' });
    expect(submit).toBeEnabled();
    await user.click(submit);

    expect(registerWithPasswordMock).toHaveBeenCalledWith({
      username: 'good_user',
      email: 'good@example.com',
      password: 'longenough',
    });
    await vi.waitFor(() => {
      expect(refreshMock).toHaveBeenCalledTimes(1);
      expect(navigateMock).toHaveBeenCalledWith('/review', { replace: true });
    });
  });

  it('register fail email_taken (409): shows "email уже занят"', async () => {
    registerWithPasswordMock.mockRejectedValueOnce(
      new ApiError(409, 'taken', 'email_taken'),
    );
    const user = userEvent.setup();
    renderAt();

    await user.click(screen.getByRole('tab', { name: 'Регистрация' }));
    await user.type(screen.getByLabelText('Username'), 'good_user');
    await user.type(screen.getByLabelText('Email'), 'taken@example.com');
    await user.type(screen.getByLabelText('Пароль'), 'longenough');
    await user.type(screen.getByLabelText('Повторите пароль'), 'longenough');
    await user.click(screen.getByRole('button', { name: 'Создать аккаунт' }));

    expect(await screen.findByText('Этот email уже занят')).toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('register fail username_taken (409): shows "username уже занят"', async () => {
    registerWithPasswordMock.mockRejectedValueOnce(
      new ApiError(409, 'taken', 'username_taken'),
    );
    const user = userEvent.setup();
    renderAt();

    await user.click(screen.getByRole('tab', { name: 'Регистрация' }));
    await user.type(screen.getByLabelText('Username'), 'taken_user');
    await user.type(screen.getByLabelText('Email'), 'fresh@example.com');
    await user.type(screen.getByLabelText('Пароль'), 'longenough');
    await user.type(screen.getByLabelText('Повторите пароль'), 'longenough');
    await user.click(screen.getByRole('button', { name: 'Создать аккаунт' }));

    expect(await screen.findByText('Этот username уже занят')).toBeInTheDocument();
  });

  it('register: short password (5 chars) → submit disabled', async () => {
    const user = userEvent.setup();
    renderAt();

    await user.click(screen.getByRole('tab', { name: 'Регистрация' }));
    await user.type(screen.getByLabelText('Username'), 'good_user');
    await user.type(screen.getByLabelText('Email'), 'good@example.com');
    await user.type(screen.getByLabelText('Пароль'), 'short');
    await user.type(screen.getByLabelText('Повторите пароль'), 'short');

    expect(screen.getByRole('button', { name: 'Создать аккаунт' })).toBeDisabled();
  });

  it('register: confirm password mismatch → submit disabled', async () => {
    const user = userEvent.setup();
    renderAt();

    await user.click(screen.getByRole('tab', { name: 'Регистрация' }));
    await user.type(screen.getByLabelText('Username'), 'good_user');
    await user.type(screen.getByLabelText('Email'), 'good@example.com');
    await user.type(screen.getByLabelText('Пароль'), 'longenough');
    await user.type(screen.getByLabelText('Повторите пароль'), 'different8');

    expect(screen.getByRole('button', { name: 'Создать аккаунт' })).toBeDisabled();
  });

  it('hides the Google button when VITE_GOOGLE_ENABLED is not "true"', () => {
    // The module reads import.meta.env at evaluation time; the default test
    // env (no .env loaded) leaves VITE_GOOGLE_ENABLED undefined → hidden.
    renderAt();
    expect(screen.queryByRole('link', { name: /Google/ })).not.toBeInTheDocument();
  });
});
