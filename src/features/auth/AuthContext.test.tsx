import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthProvider } from './AuthContext';
import { useAuth } from './useAuth';

// Mock the API module — every test in this file controls fetchMe/logout
// directly so we don't depend on a real backend URL.
vi.mock('./api', () => ({
  fetchMe: vi.fn(),
  logout: vi.fn(),
  requestEmailLink: vi.fn(),
  googleStartUrl: () => 'http://api.test/api/v1/auth/google/start',
}));

import { fetchMe, logout } from './api';
const fetchMeMock = vi.mocked(fetchMe);
const logoutMock = vi.mocked(logout);

function Probe() {
  const { status, user, refresh, logout } = useAuth();
  return (
    <div>
      <div data-testid="status">{status}</div>
      <div data-testid="email">{user?.email ?? ''}</div>
      <button onClick={() => void refresh()}>refresh</button>
      <button onClick={() => void logout()}>logout</button>
    </div>
  );
}

function renderProbe() {
  return render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
}

describe('AuthContext', () => {
  beforeEach(() => {
    fetchMeMock.mockReset();
    logoutMock.mockReset();
  });

  it('transitions loading → authenticated when /me returns a user', async () => {
    fetchMeMock.mockResolvedValueOnce({
      user: { id: 'u1', email: 'a@b.c', name: 'A', createdAt: 0 },
    });

    renderProbe();

    // First render — before useEffect fires the call.
    expect(screen.getByTestId('status').textContent).toBe('loading');

    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('authenticated');
    });
    expect(screen.getByTestId('email').textContent).toBe('a@b.c');
  });

  it('transitions loading → guest when /me returns {user: null} (401 path)', async () => {
    // fetchMe already swallows 401 → null; from the context's perspective it
    // just sees `{user: null}`.
    fetchMeMock.mockResolvedValueOnce({ user: null });

    renderProbe();

    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('guest');
    });
    expect(screen.getByTestId('email').textContent).toBe('');
  });

  it('treats fetchMe throwing as guest (network failure)', async () => {
    fetchMeMock.mockRejectedValueOnce(new Error('network down'));

    renderProbe();

    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('guest');
    });
  });

  it('logout() clears the user and resets state to guest', async () => {
    fetchMeMock.mockResolvedValueOnce({
      user: { id: 'u1', email: 'a@b.c', name: 'A', createdAt: 0 },
    });
    logoutMock.mockResolvedValueOnce(undefined);

    const user = userEvent.setup();
    renderProbe();

    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('authenticated');
    });

    await user.click(screen.getByRole('button', { name: 'logout' }));

    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('guest');
    });
    expect(logoutMock).toHaveBeenCalledTimes(1);
  });
});
