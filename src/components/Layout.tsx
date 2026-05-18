import { Outlet, NavLink } from 'react-router-dom';
import { BarChart3, Brain, Upload, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/features/auth/AuthContext';
import { UserBadge } from '@/features/auth/UserBadge';
import { SyncIndicator } from '@/features/sync/SyncIndicator';
import { useSync } from '@/features/sync/useSync';

const navItems: { to: string; label: string; Icon: LucideIcon }[] = [
  { to: '/review', label: 'Повторение', Icon: Brain },
  { to: '/import', label: 'Импорт', Icon: Upload },
  { to: '/stats', label: 'Статистика', Icon: BarChart3 },
];

export function Layout() {
  const { status } = useAuth();
  useSync({ enabled: status === 'authenticated' });
  const authenticated = status === 'authenticated';

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="border-b">
        <div className="mx-auto flex max-w-3xl items-center gap-4 px-4 py-3">
          <NavLink to="/review" aria-label="ild" className="flex items-baseline gap-2">
            <span className="text-xl font-bold tracking-tight">ild</span>
            <span className="hidden text-xs text-muted-foreground sm:inline">
              китайский с SM-2
            </span>
          </NavLink>
          <nav className="flex flex-1 items-center justify-center gap-4 text-sm">
            {navItems.map(({ to, label, Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-2 text-muted-foreground transition-colors hover:text-foreground',
                    isActive && 'font-bold text-foreground underline underline-offset-4',
                  )
                }
              >
                <Icon className="h-4 w-4" />
                <span className="hidden sm:inline">{label}</span>
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            {authenticated && (
              <div className="hidden sm:block">
                <SyncIndicator />
              </div>
            )}
            <UserBadge />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
