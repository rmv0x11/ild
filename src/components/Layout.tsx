import { Outlet, NavLink } from 'react-router-dom';
import { ArrowLeftRight, BarChart3, Brain, Layers, Upload, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getLanguageMeta } from '@/lib/lang/language';
import { useActiveLanguage } from '@/features/lang/useActiveLanguage';
import { LanguageSwitcher } from '@/features/lang/LanguageSwitcher';
import { useAuth } from '@/features/auth/AuthContext';
import { UserBadge } from '@/features/auth/UserBadge';
import { SyncIndicator } from '@/features/sync/SyncIndicator';
import { useSync } from '@/features/sync/useSync';

const navItems: { to: string; label: string; Icon: LucideIcon }[] = [
  { to: '/review', label: 'Повторение', Icon: Brain },
  { to: '/synonyms', label: 'Синонимы', Icon: ArrowLeftRight },
  { to: '/cards', label: 'Колода', Icon: Layers },
  { to: '/import', label: 'Импорт', Icon: Upload },
  { to: '/stats', label: 'Статистика', Icon: BarChart3 },
];

export function Layout() {
  const { status } = useAuth();
  useSync({ enabled: status === 'authenticated' });
  const authenticated = status === 'authenticated';
  const [lang] = useActiveLanguage();
  const subtitle = getLanguageMeta(lang).subtitle;

  return (
    <div className="bg-background text-foreground min-h-dvh">
      <header className="border-b">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <NavLink to="/review" aria-label="ild" className="flex items-baseline gap-2">
            <span className="text-xl font-bold tracking-tight">ild</span>
            <span className="text-muted-foreground hidden text-xs sm:inline">{subtitle}</span>
          </NavLink>
          {/* Desktop nav lives in the header; on mobile it moves to a bottom bar. */}
          <nav className="hidden flex-1 items-center justify-center gap-4 text-sm md:flex">
            {navItems.map(({ to, label, Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  cn(
                    'text-muted-foreground hover:text-foreground flex items-center gap-2 transition-colors',
                    isActive && 'text-foreground font-bold underline underline-offset-4',
                  )
                }
              >
                <Icon className="h-4 w-4" />
                <span>{label}</span>
              </NavLink>
            ))}
          </nav>
          <div className="flex flex-1 items-center justify-end gap-2 md:flex-none">
            <LanguageSwitcher />
            {authenticated && (
              <div className="hidden sm:block">
                <SyncIndicator />
              </div>
            )}
            <UserBadge />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 pt-6 pb-24 md:pb-6">
        <Outlet />
      </main>

      {/* Mobile bottom tab bar — thumb-reachable navigation. */}
      <nav
        aria-label="Навигация"
        className="bg-background/95 fixed inset-x-0 bottom-0 z-40 border-t backdrop-blur md:hidden"
      >
        <div className="mx-auto flex max-w-3xl items-stretch justify-around">
          {navItems.map(({ to, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  'flex flex-1 flex-col items-center gap-1 py-2 text-[10px] font-medium transition-colors',
                  isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
                )
              }
            >
              <Icon className="h-5 w-5" />
              <span>{label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
