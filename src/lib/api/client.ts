/**
 * Thin fetch wrapper for the ild backend API.
 *
 * Cookies are HttpOnly + SameSite=Lax, so every request must go with
 * `credentials: 'include'`. The base URL is configured at build time via
 * `VITE_API_URL` — an empty value means "no backend configured" (offline-only
 * mode), and any caller that needs the API should gate on `hasApi()` first.
 *
 * Errors are normalised to {@link ApiError} so consumers can switch on
 * `status`/`code` without re-parsing the response body. We deliberately do
 * NOT log 401s here — `AuthContext` treats them as a normal "guest" signal,
 * and noisy console output during page loads is worse than silent.
 */

export const API_URL: string = import.meta.env.VITE_API_URL ?? '';

/** Returns true when a backend base URL is configured. */
export function hasApi(): boolean {
  return API_URL.length > 0;
}

/** Domain error thrown for any non-2xx API response (or network failure). */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string | undefined;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

interface ErrorBody {
  error?: string;
  message?: string;
}

function isErrorBody(value: unknown): value is ErrorBody {
  return typeof value === 'object' && value !== null;
}

/**
 * Issues an authenticated request against the API and parses the response
 * as JSON. Returns `undefined as T` for 204 No Content so callers expecting
 * "void" don't have to special-case the empty body.
 *
 * Throws:
 * - `ApiError` with status 0 for network failures / aborted fetches.
 * - `ApiError` with the upstream status (and `code`/`message` if the body
 *   contains a JSON error envelope) for any non-2xx response.
 */
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  if (!hasApi()) {
    throw new ApiError(0, 'API base URL is not configured (VITE_API_URL is empty)');
  }

  const url = `${API_URL}${path}`;
  if (import.meta.env.DEV) {
    console.debug('[api]', init?.method ?? 'GET', url);
  }

  // Default to JSON; callers can override either header by passing their
  // own `headers` map (the spread below preserves their values).
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(init?.headers ?? {}),
  };

  let response: Response;
  try {
    response = await fetch(url, {
      credentials: 'include',
      ...init,
      headers,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Network error';
    throw new ApiError(0, message);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  // For non-2xx we try to extract `{error, message}` from the body, but we
  // never let JSON parse failures mask the real status code.
  if (!response.ok) {
    let code: string | undefined;
    let message = `Request failed with status ${response.status}`;
    try {
      const body: unknown = await response.json();
      if (isErrorBody(body)) {
        if (typeof body.error === 'string') code = body.error;
        if (typeof body.message === 'string') message = body.message;
      }
    } catch {
      // Body wasn't JSON — fall back to the generic message above.
    }
    throw new ApiError(response.status, message, code);
  }

  // 2xx with a body: parse JSON. An empty body (e.g. some 200s) becomes
  // `undefined as T` rather than throwing, matching the 204 behaviour.
  const text = await response.text();
  if (text.length === 0) {
    return undefined as T;
  }
  try {
    return JSON.parse(text) as T;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid JSON in response';
    throw new ApiError(response.status, message);
  }
}

export function apiGet<T>(path: string, init?: RequestInit): Promise<T> {
  return apiFetch<T>(path, { ...init, method: 'GET' });
}

export function apiPost<T>(path: string, body?: unknown, init?: RequestInit): Promise<T> {
  return apiFetch<T>(path, {
    ...init,
    method: 'POST',
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export function apiDelete<T>(path: string, init?: RequestInit): Promise<T> {
  return apiFetch<T>(path, { ...init, method: 'DELETE' });
}
