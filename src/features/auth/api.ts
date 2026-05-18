/**
 * API calls for the auth flow. Thin wrappers over `apiFetch` that hide the
 * 401-on-guest contract: `fetchMe` resolves to `{user: null}` for guests so
 * callers can do `if (user)` without try/catching every consumer.
 */

import { API_URL, ApiError, apiFetch, apiPost } from '@/lib/api/client';
import type { AuthUser } from './types';

interface MeResponse {
  user: AuthUser | null;
}

interface AuthUserResponse {
  user: AuthUser;
}

export interface RegisterRequest {
  username: string;
  email: string;
  password: string;
}

/**
 * Fetches the current session user. A 401 from the backend is the expected
 * "guest" response — we swallow it here and return `{user: null}` so the
 * caller never has to distinguish "logged out" from "request failed".
 * Other errors (network, 5xx) propagate.
 */
export async function fetchMe(): Promise<MeResponse> {
  try {
    return await apiFetch<MeResponse>('/api/v1/me');
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      return { user: null };
    }
    throw err;
  }
}

/**
 * Asks the backend to send a magic-link email. The endpoint always returns
 * 200 regardless of whether the address exists (anti-enumeration), so a
 * resolved promise here is NOT proof of delivery — only of "request
 * accepted". The UI should always show the same "check your inbox" state.
 */
export async function requestEmailLink(email: string): Promise<void> {
  await apiPost<void>('/api/v1/auth/email/request', { email });
}

/** POSTs to /auth/logout — drops the session cookie on the server. */
export async function logout(): Promise<void> {
  await apiPost<void>('/api/v1/auth/logout');
}

/**
 * URL for the Google OAuth handshake. Used as `window.location.href = ...`
 * because a redirect back from Google must hit a real browser page in order
 * for `Set-Cookie` to stick — XHR/fetch would silently discard the cookie.
 */
export function googleStartUrl(): string {
  return `${API_URL}/api/v1/auth/google/start`;
}

/**
 * Creates an account with username + email + password. Backend sets the
 * session cookie on success, so the caller should call `refresh()` to pick
 * up the new identity.
 *
 * Error contract:
 *   - 409 `{error: 'email_taken'}` / `{error: 'username_taken'}` → re-thrown
 *     as `ApiError` with `status=409` and `code` set so the UI can map to a
 *     specific field error.
 *   - 400 `{error: 'validation'}` → `ApiError(400, code='validation')` for
 *     server-side validation failures the client missed.
 * Other errors propagate.
 */
export async function registerWithPassword(req: RegisterRequest): Promise<AuthUser> {
  const { user } = await apiPost<AuthUserResponse>('/api/v1/auth/register', req);
  return user;
}

/**
 * Logs in with an identifier (email or username) + password. Backend sets
 * the session cookie on success.
 *
 * Throws `ApiError(401, code='invalid_credentials')` for a bad pair so the
 * UI can show a single generic "wrong credentials" message (we intentionally
 * do not distinguish "no such user" from "wrong password").
 */
export async function loginWithPassword(
  identifier: string,
  password: string,
): Promise<AuthUser> {
  const { user } = await apiPost<AuthUserResponse>('/api/v1/auth/login', {
    identifier,
    password,
  });
  return user;
}

/**
 * Sets a password for the currently signed-in user. Used to upgrade a
 * magic-link or OAuth account so the owner can also sign in with a
 * password in the future.
 *
 * Backend contract:
 *   - 200 `{ok: true}` — hash stored.
 *   - 400 `{error: 'invalid_password'}` — failed length check (8..200).
 *   - 401 — no active session (caller must be logged in).
 */
export async function setPassword(password: string): Promise<void> {
  await apiPost<{ ok: true }>('/api/v1/auth/set-password', { password });
}
