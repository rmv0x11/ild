import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UserBadge } from './UserBadge';
import type { AuthContextValue } from './AuthContext';

// We stub the `useAuth` hook directly — UserBadge imports it from
// './useAuth', so we mock that module.
vi.mock('./useAuth', () => ({
  useAuth: vi.fn(),
}));

import { useAuth } from './useAuth';
const useAuthMock = vi.mocked(useAuth);

function renderBadge(state: Partial<AuthContextValue>) {
  const value: AuthContextValue = {
    status: 'guest',
    user: null,
    refresh: vi.fn(() => Promise.resolve()),
    logout: vi.fn(() => Promise.resolve()),
    ...state,
  };
  useAuthMock.mockReturnValue(value);
  return {
    value,
    ...render(
      <MemoryRouter>
        <UserBadge />
      </MemoryRouter>,
    ),
  };
}

describe('UserBadge', () => {
  it('renders a skeleton in the loading state', () => {
    renderBadge({ status: 'loading', user: null });
    expect(screen.getByTestId('user-badge-loading')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Войти' })).not.toBeInTheDocument();
  });

  it('renders a Войти link in the guest state', () => {
    renderBadge({ status: 'guest', user: null });
    const link = screen.getByRole('link', { name: 'Войти' });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/login');
  });

  it('renders the email and shows a Выйти action on click in the authenticated state', async () => {
    const user = userEvent.setup();
    const { value } = renderBadge({
      status: 'authenticated',
      user: { id: 'u1', email: 'me@example.com', name: 'Me', createdAt: 0 },
    });

    // Email is visible up front; Выйти only appears in the open dropdown.
    expect(screen.getByText('me@example.com')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Выйти/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /me@example.com/ }));

    const logoutBtn = await screen.findByRole('button', { name: /Выйти/ });
    expect(logoutBtn).toBeInTheDocument();

    await user.click(logoutBtn);
    expect(value.logout).toHaveBeenCalledTimes(1);
    expect(value.refresh).toHaveBeenCalledTimes(1);
  });
});
