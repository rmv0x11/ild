/**
 * Login screen — three entry methods plus an optional Google OAuth shortcut.
 *
 * Tabs (custom, no Radix dependency — just three buttons with conditional
 * render below them):
 *   1. `magic`    — original email-magic-link form (unchanged behaviour).
 *   2. `password` — identifier (email|username) + password.
 *   3. `register` — username + email + password + confirm password.
 *
 * Validation strategy:
 *   - Inline client-side rules (regex/length/match) make Submit disabled
 *     until everything is valid, so the happy-path post never round-trips
 *     a 400.
 *   - Server-side 409s on register and 401 on password-login are surfaced
 *     as in-form errors (Russian copy). 5xx/network → toast, form stays.
 *
 * On a successful login/register we call `useAuth().refresh()` (which
 * re-fetches /me and updates the provider's state) and navigate to
 * `/review`. The cookie was set by the backend, same channel as magic-link.
 */

import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
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
import { cn } from '@/lib/utils';
import { ApiError } from '@/lib/api/client';
import {
  googleStartUrl,
  loginWithPassword,
  registerWithPassword,
  requestEmailLink,
} from './api';
import { useAuth } from './useAuth';

const googleEnabled = import.meta.env.VITE_GOOGLE_ENABLED === 'true';

type TabKey = 'magic' | 'password' | 'register';

const TABS: ReadonlyArray<{ key: TabKey; label: string }> = [
  { key: 'magic', label: 'Войти по магик-ссылке' },
  { key: 'password', label: 'Пароль' },
  { key: 'register', label: 'Регистрация' },
];

// --- Validation rules ---------------------------------------------------
// Kept module-private; the test file exercises them indirectly through the
// disabled-state of the submit button.

const USERNAME_RE = /^[a-zA-Z0-9_-]{3,32}$/;
// Permissive email check — we let the backend do canonical validation; this
// only catches obvious typos so the disabled-state feels responsive.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_MIN = 8;

function isUsernameValid(s: string): boolean {
  return USERNAME_RE.test(s);
}
function isEmailValid(s: string): boolean {
  return EMAIL_RE.test(s);
}
function isPasswordValid(s: string): boolean {
  return s.length >= PASSWORD_MIN;
}

export function LoginPage() {
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState<TabKey>('magic');

  // We don't act on `next` here — the backend always redirects to "/" —
  // but we forward it through the Google flow and keep it visible for
  // future use. (`useSearchParams` is read-only, no need to memoise.)
  const nextParam = searchParams.get('next');

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

          <TabSwitcher active={tab} onChange={setTab} />

          {tab === 'magic' && <MagicLinkForm />}
          {tab === 'password' && <PasswordLoginForm />}
          {tab === 'register' && <RegisterForm />}

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

// ---------------------------------------------------------------------------
// Tab switcher
// ---------------------------------------------------------------------------

/**
 * Three-button group implementing tab semantics without Radix. The active
 * tab gets the "default" button variant (primary fill); inactive tabs are
 * `outline` so the visual contrast is unambiguous.
 *
 * We expose `role="tablist"` + `role="tab"` so screen readers and tests
 * can target the elements by accessible role.
 */
function TabSwitcher({
  active,
  onChange,
}: {
  active: TabKey;
  onChange: (k: TabKey) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Способ входа"
      className="grid grid-cols-3 gap-1 rounded-md border bg-muted p-1"
    >
      {TABS.map(({ key, label }) => {
        const selected = active === key;
        return (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(key)}
            className={cn(
              'h-8 rounded-sm px-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              selected
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab 1: magic link (verbatim behaviour from the previous LoginPage)
// ---------------------------------------------------------------------------

function MagicLinkForm() {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

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

  if (sentTo) {
    return (
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
    );
  }

  return (
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
  );
}

// ---------------------------------------------------------------------------
// Tab 2: password login (identifier = email OR username)
// ---------------------------------------------------------------------------

function PasswordLoginForm() {
  const { refresh } = useAuth();
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Both fields must be non-empty to enable submit. We don't enforce
  // username/email shape here because identifier accepts either.
  const canSubmit =
    identifier.trim().length > 0 && password.length > 0 && !submitting;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!canSubmit) return;

    setFormError(null);
    setSubmitting(true);
    try {
      await loginWithPassword(identifier.trim(), password);
      await refresh();
      navigate('/review', { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setFormError('Неверный email/username или пароль');
      } else if (err instanceof ApiError && err.status === 0) {
        toast.error('Сервер недоступен');
      } else if (err instanceof ApiError && err.message) {
        toast.error(err.message);
      } else {
        toast.error('Не удалось войти');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="flex flex-col gap-3" onSubmit={handleSubmit} noValidate>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="pw-identifier">Email или username</Label>
        <Input
          id="pw-identifier"
          type="text"
          autoComplete="username"
          required
          placeholder="you@example.com или username"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          disabled={submitting}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="pw-password">Пароль</Label>
        <Input
          id="pw-password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={submitting}
        />
      </div>
      {formError && (
        <p role="alert" className="text-sm text-destructive">
          {formError}
        </p>
      )}
      <Button type="submit" disabled={!canSubmit}>
        {submitting ? 'Входим…' : 'Войти'}
      </Button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Tab 3: registration
// ---------------------------------------------------------------------------

/**
 * Field-level errors are derived on each render from the raw input values.
 * To avoid flashing red on a fresh form we gate per-field rendering on a
 * `touched` flag set by the field's `onBlur`. Submitting also forces every
 * touched-flag to `true` so a blind click on Submit still gets feedback —
 * but the disabled state means that path is rare.
 */
function RegisterForm() {
  const { refresh } = useAuth();
  const navigate = useNavigate();

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  const [touched, setTouched] = useState({
    username: false,
    email: false,
    password: false,
    confirm: false,
  });
  const markTouched = (field: keyof typeof touched) =>
    setTouched((t) => ({ ...t, [field]: true }));

  const [submitting, setSubmitting] = useState(false);
  // Field-specific server errors (e.g. "email taken"). Cleared on every
  // edit of the relevant field so the user sees them disappear as they
  // type the fix.
  const [usernameServerError, setUsernameServerError] = useState<string | null>(
    null,
  );
  const [emailServerError, setEmailServerError] = useState<string | null>(null);

  const usernameError = !isUsernameValid(username)
    ? 'Username: 3-32 символов, латиница/цифры/_-'
    : null;
  const emailError = !isEmailValid(email) ? 'Введите корректный email' : null;
  const passwordError = !isPasswordValid(password)
    ? `Минимум ${PASSWORD_MIN.toString()} символов`
    : null;
  const confirmError =
    confirm.length > 0 && confirm !== password ? 'Пароли не совпадают' : null;

  const allValid =
    !usernameError &&
    !emailError &&
    !passwordError &&
    confirm === password &&
    confirm.length > 0;

  const canSubmit = allValid && !submitting;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!canSubmit) return;

    setUsernameServerError(null);
    setEmailServerError(null);
    setSubmitting(true);
    try {
      await registerWithPassword({
        username: username.trim(),
        email: email.trim(),
        password,
      });
      await refresh();
      navigate('/review', { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        // Backend tells us exactly which field collided; we only ever set
        // one of the two — never both — even though both fields stay in
        // the form. Following the API contract verbatim.
        if (err.code === 'email_taken') {
          setEmailServerError('Этот email уже занят');
        } else if (err.code === 'username_taken') {
          setUsernameServerError('Этот username уже занят');
        } else {
          toast.error(err.message || 'Конфликт регистрации');
        }
      } else if (err instanceof ApiError && err.status === 400) {
        toast.error(err.message || 'Проверьте введённые данные');
      } else if (err instanceof ApiError && err.status === 0) {
        toast.error('Сервер недоступен');
      } else if (err instanceof ApiError && err.message) {
        toast.error(err.message);
      } else {
        toast.error('Не удалось зарегистрироваться');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="flex flex-col gap-3" onSubmit={handleSubmit} noValidate>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="reg-username">Username</Label>
        <Input
          id="reg-username"
          type="text"
          autoComplete="username"
          required
          placeholder="username"
          value={username}
          onChange={(e) => {
            setUsername(e.target.value);
            setUsernameServerError(null);
          }}
          onBlur={() => markTouched('username')}
          disabled={submitting}
        />
        {touched.username && usernameError && (
          <p className="text-xs text-destructive">{usernameError}</p>
        )}
        {usernameServerError && (
          <p role="alert" className="text-xs text-destructive">
            {usernameServerError}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="reg-email">Email</Label>
        <Input
          id="reg-email"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          placeholder="you@example.com"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setEmailServerError(null);
          }}
          onBlur={() => markTouched('email')}
          disabled={submitting}
        />
        {touched.email && emailError && (
          <p className="text-xs text-destructive">{emailError}</p>
        )}
        {emailServerError && (
          <p role="alert" className="text-xs text-destructive">
            {emailServerError}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="reg-password">Пароль</Label>
        <Input
          id="reg-password"
          type="password"
          autoComplete="new-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onBlur={() => markTouched('password')}
          disabled={submitting}
        />
        {touched.password && passwordError && (
          <p className="text-xs text-destructive">{passwordError}</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="reg-confirm">Повторите пароль</Label>
        <Input
          id="reg-confirm"
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          onBlur={() => markTouched('confirm')}
          disabled={submitting}
        />
        {touched.confirm && confirmError && (
          <p className="text-xs text-destructive">{confirmError}</p>
        )}
      </div>

      <Button type="submit" disabled={!canSubmit}>
        {submitting ? 'Создаём…' : 'Создать аккаунт'}
      </Button>
    </form>
  );
}
