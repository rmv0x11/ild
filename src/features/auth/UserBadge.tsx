/**
 * Header chip that adapts to the auth state:
 *   - loading       → skeleton placeholder
 *   - guest         → "Войти" link styled like an outline button
 *   - authenticated → email button + click-to-toggle "Выйти" popover
 *
 * The popover is plain useState — we deliberately don't pull in a shadcn
 * `DropdownMenu` for one item. The outside-click handler closes it on any
 * pointerdown outside the wrapper.
 */

import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, LogOut } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAuth } from './useAuth';

export function UserBadge() {
  const { status, user, logout, refresh } = useAuth();
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  // Outside-click and Escape both dismiss the popover. We attach listeners
  // only while it's open to avoid a permanent global handler.
  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event: PointerEvent): void => {
      if (!wrapperRef.current) return;
      if (event.target instanceof Node && !wrapperRef.current.contains(event.target)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  if (status === 'loading') {
    return (
      <div
        className="h-8 w-24 animate-pulse rounded bg-muted"
        aria-label="Загрузка профиля"
        data-testid="user-badge-loading"
      />
    );
  }

  if (status === 'guest' || !user) {
    return (
      <Link to="/login" className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}>
        Войти
      </Link>
    );
  }

  const handleLogout = async (): Promise<void> => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await logout();
      await refresh();
    } finally {
      setLoggingOut(false);
      setOpen(false);
    }
  };

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-8 items-center gap-2 rounded-md border border-input bg-background px-3 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <span className="max-w-[14rem] truncate">{user.email}</span>
        <ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-1 w-48 rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
        >
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              void handleLogout();
            }}
            disabled={loggingOut}
            className="w-full justify-start"
          >
            <LogOut className="h-4 w-4" />
            {loggingOut ? 'Выходим…' : 'Выйти'}
          </Button>
        </div>
      )}
    </div>
  );
}
