/**
 * Login screen — magic-link email + (optional) Google OAuth.
 *
 * The form has two states:
 *   1. `entry`   — input + submit button + Google + guest-mode link.
 *   2. `sent`    — "check your inbox" message + "try another email" reset.
 *
 * The backend always returns 200 on the email/request endpoint (anti-
 * enumeration), so we never branch on response — a non-throw means we
 * trust we are in the `sent` state regardless of whether the address
 * actually exists.
 */

import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Globe, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiError } from '@/lib/api/client';
import { googleStartUrl, requestEmailLink } from './api';

const googleEnabled = import.meta.env.VITE_GOOGLE_ENABLED === 'true';

export function LoginPage() {
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  // We don't act on `next` here — the backend always redirects to "/" —
  // but we forward it through the Google flow and keep it visible for
  // future use. (`useSearchParams` is read-only, no need to memoise.)
  const nextParam = searchParams.get('next');

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;

    setSubmitting(true);
    try {
      await requestEmailLink(trimmed);
      setSentTo(trimmed);
    } catch (err) {
      // Network / 5xx — show toast but keep the form so the user can retry.
      // 4xx with a `code`/`message` from the server is surfaced verbatim.
      if (err instanceof ApiError && err.status === 0) {
        toast.error('Сервер недоступен');
      } else if (err instanceof ApiError && err.message) {
        toast.error(err.message);
      } else {
        toast.error('Не удалось отправить ссылку');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = (): void => {
    setSentTo(null);
    setEmail('');
  };

  // Build the Google start URL with `?next` preserved so a future backend
  // can honour it. The current backend ignores extra query params.
  const googleHref = nextParam
    ? `${googleStartUrl()}?next=${encodeURIComponent(nextParam)}`
    : googleStartUrl();

  return (
    <div className="flex min-h-[60vh] items-center justify-center py-10">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Войти в ild</CardTitle>
          <CardDescription>
            Вход открывает синхронизацию карточек между устройствами.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          {googleEnabled && (
            <>
              <a
                href={googleHref}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-input bg-background px-4 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <Globe className="h-4 w-4" />
                Войти через Google
              </a>
              <div className="flex items-center gap-3 text-xs uppercase text-muted-foreground">
                <span className="h-px flex-1 bg-border" />
                или
                <span className="h-px flex-1 bg-border" />
              </div>
            </>
          )}

          {sentTo ? (
            <div className="flex flex-col gap-3 rounded-md border bg-muted/40 p-4 text-sm">
              <div className="flex items-start gap-3">
                <Mail className="mt-0.5 h-5 w-5 text-muted-foreground" />
                <div className="flex flex-col gap-1">
                  <div className="font-medium">Письмо отправлено на {sentTo}</div>
                  <p className="text-muted-foreground">
                    Проверьте почту — ссылка действует ограниченное время.
                  </p>
                </div>
              </div>
              <Button variant="outline" onClick={handleReset}>
                Попробовать другой email
              </Button>
            </div>
          ) : (
            <form className="flex flex-col gap-3" onSubmit={handleSubmit} noValidate>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="login-email">Email</Label>
                <Input
                  id="login-email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  required
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={submitting}
                />
              </div>
              <Button type="submit" disabled={submitting || email.trim().length === 0}>
                {submitting ? 'Отправляем…' : 'Получить ссылку'}
              </Button>
            </form>
          )}

          <div className="flex flex-col items-center gap-1 border-t pt-4 text-center">
            <p className="text-xs text-muted-foreground">
              Без входа карточки хранятся только в этом браузере.
            </p>
            <Link
              to="/review"
              className="text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              Гостевой режим
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
