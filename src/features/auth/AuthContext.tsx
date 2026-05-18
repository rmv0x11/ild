/**
 * Top-level auth state for the app.
 *
 * `AuthProvider` runs `fetchMe` once on mount and exposes the resulting
 * {@link AuthState} plus imperative `refresh()` / `logout()` helpers. The
 * provider deliberately ignores network errors (treats them as "guest")
 * so the rest of the UI doesn't have to deal with auth being uncertain —
 * we either know who you are, or we don't.
 *
 * The `useAuth` hook lives in a sibling file (`useAuth.ts`) so HMR fast
 * refresh treats this module as components-only.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AuthContext, type AuthContextValue } from './authContextValue';
import { fetchMe, logout as apiLogout } from './api';
import type { AuthState, AuthUser } from './types';

const initialState: AuthState = { status: 'loading', user: null };

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(initialState);
  // StrictMode runs effects twice in dev — guard so we don't fire two
  // initial /me calls (it's harmless, but it shows up in network panel).
  const mountedRef = useRef(false);

  const applyUser = useCallback((user: AuthUser | null) => {
    setState({
      status: user ? 'authenticated' : 'guest',
      user,
    });
  }, []);

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const { user } = await fetchMe();
      applyUser(user);
    } catch {
      // Network/5xx — treat as guest to keep the UI usable offline. The
      // user can retry by logging in again; once a session exists, sync
      // will surface its own errors.
      applyUser(null);
    }
  }, [applyUser]);

  const logout = useCallback(async (): Promise<void> => {
    try {
      await apiLogout();
    } catch {
      // Even if the server call fails, clear local state — the cookie
      // might already be gone, and we don't want a stuck "authenticated".
    }
    applyUser(null);
  }, [applyUser]);

  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;
    void refresh();
  }, [refresh]);

  const value = useMemo<AuthContextValue>(
    () => ({ ...state, refresh, logout }),
    [state, refresh, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// Re-exports for backward compatibility — Agent C's Layout imports
// `useAuth` directly from this module. The corresponding React Refresh
// warning is acceptable: the same pattern is used by every shadcn-ui
// primitive in this repo (button.tsx, badge.tsx, …).
export { useAuth } from './useAuth';
export type { AuthContextValue } from './authContextValue';
