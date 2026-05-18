/**
 * `/auth/callback` — a safety-net landing page for OAuth/magic-link
 * redirects. The backend currently redirects straight to `/`, but if a
 * future config (or an external IdP) points to this route, we still need
 * to refresh the session and forward the user appropriately.
 *
 * Flow on mount:
 *   1. await refresh() — re-fetches `/me`.
 *   2. once context state is no longer 'loading':
 *        - 'authenticated' → navigate /review
 *        - 'guest'         → navigate /login
 *
 * We can't read the post-refresh `status` from the same effect (setState
 * is async), so we watch `status` in a second effect once we know refresh
 * has completed.
 */

import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from './useAuth';

export function AuthCallbackPage() {
  const { refresh, status } = useAuth();
  const navigate = useNavigate();
  const refreshedRef = useRef(false);

  // Kick off the refresh exactly once.
  useEffect(() => {
    if (refreshedRef.current) return;
    refreshedRef.current = true;
    void refresh();
  }, [refresh]);

  // Route as soon as the auth state stabilises.
  useEffect(() => {
    if (status === 'authenticated') {
      navigate('/review', { replace: true });
    } else if (status === 'guest') {
      navigate('/login', { replace: true });
    }
  }, [status, navigate]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-muted-foreground">
      <Loader2 className="h-8 w-8 animate-spin" aria-hidden="true" />
      <p className="text-sm">Завершаем вход…</p>
    </div>
  );
}
