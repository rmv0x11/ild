/**
 * Modal that lets the currently-signed-in user set or change their password.
 * Used to upgrade magic-link / OAuth accounts so they can also use the
 * password-login flow.
 */

import { useEffect, useState, type FormEvent } from 'react';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiError } from '@/lib/api/client';
import { setPassword } from './api';

interface SetPasswordDialogProps {
  open: boolean;
  onClose: () => void;
}

const MIN_LENGTH = 8;

export function SetPasswordDialog({ open, onClose }: SetPasswordDialogProps) {
  const [password, setPasswordValue] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Esc closes the dialog. State reset is handled by re-keying this component
  // on open from the parent (see UserBadge), so a fresh mount = empty form;
  // we no longer setState() inside useEffect (forbidden by
  // react-hooks/set-state-in-effect).
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const passwordValid = password.length >= MIN_LENGTH;
  const confirmValid = confirm.length > 0 && confirm === password;
  const canSubmit = passwordValid && confirmValid && !submitting;

  const handleSubmit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await setPassword(password);
      toast.success('Пароль установлен');
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) {
        setError('Пароль не прошёл проверку. Минимум 8 символов.');
      } else if (err instanceof ApiError && err.status === 401) {
        setError('Сессия истекла. Войдите снова.');
      } else {
        setError('Не удалось сохранить пароль. Попробуйте ещё раз.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="set-password-title"
    >
      <div className="w-full max-w-md rounded-lg border bg-card p-6 shadow-lg">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 id="set-password-title" className="text-lg font-semibold">
              Установить пароль
            </h2>
            <p className="text-sm text-muted-foreground">
              Дайте аккаунту пароль, чтобы входить по нему вместо магик-ссылки.
            </p>
          </div>
          <button
            type="button"
            aria-label="Закрыть"
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-password">Новый пароль</Label>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPasswordValue(e.target.value)}
              minLength={MIN_LENGTH}
              required
            />
            {password.length > 0 && !passwordValid && (
              <p className="text-xs text-red-600">Минимум {MIN_LENGTH} символов.</p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="confirm-password">Повторите пароль</Label>
            <Input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
            />
            {confirm.length > 0 && !confirmValid && (
              <p className="text-xs text-red-600">Пароли не совпадают.</p>
            )}
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
              Отмена
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {submitting ? 'Сохраняем…' : 'Сохранить'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
