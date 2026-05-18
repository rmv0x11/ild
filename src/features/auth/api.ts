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
