import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { vi } from 'vitest';
import { Layout } from './Layout';

vi.mock('@/features/auth/AuthContext', () => ({
  useAuth: () => ({ status: 'guest', user: null, refresh: vi.fn(), logout: vi.fn() }),
}));

vi.mock('@/features/auth/UserBadge', () => ({
  UserBadge: () => null,
}));

vi.mock('@/features/sync/SyncIndicator', () => ({
  SyncIndicator: () => null,
}));

vi.mock('@/features/sync/useSync', () => ({
  useSync: () => ({
    state: {
      status: 'idle',
      lastSyncAt: null,
      error: null,
      pendingPush: { cards: 0, reviews: 0 },
    },
    syncNow: vi.fn(),
  }),
}));

function renderLayout(initialPath = '/review') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route element={<Layout />}>
          <Route path="review" element={<div>review-stub</div>} />
          <Route path="import" element={<div>import-stub</div>} />
          <Route path="stats" element={<div>stats-stub</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

// Nav items are rendered twice: the desktop nav in the header and the mobile
// bottom tab bar (both are in the DOM under jsdom since media queries don't
// apply). The desktop nav has no accessible name; the mobile bar is labelled
// "Навигация". Only the desktop nav toggles font-bold/underline on the active
// link, so scope link queries to it.
function getDesktopNav() {
  const navs = screen.getAllByRole('navigation');
  const desktop = navs.find((nav) => !nav.getAttribute('aria-label'));
  if (!desktop) throw new Error('desktop nav not found');
  return desktop;
}

describe('Layout', () => {
  it('renders header with title "ild"', () => {
    renderLayout();
    const title = screen.getByRole('link', { name: 'ild' });
    expect(title).toBeInTheDocument();
    expect(title).toHaveAttribute('href', '/review');
  });

  it('navigation has links to Повторение, Импорт, and Статистика', () => {
    renderLayout();
    const nav = within(getDesktopNav());
    expect(nav.getByRole('link', { name: 'Повторение' })).toHaveAttribute('href', '/review');
    expect(nav.getByRole('link', { name: 'Импорт' })).toHaveAttribute('href', '/import');
    expect(nav.getByRole('link', { name: 'Статистика' })).toHaveAttribute('href', '/stats');
  });

  it('renders the active route content via Outlet', () => {
    renderLayout('/review');
    expect(screen.getByText('review-stub')).toBeInTheDocument();
  });

  it('marks the active NavLink with bold/underline classes', () => {
    renderLayout('/review');
    const nav = within(getDesktopNav());
    const active = nav.getByRole('link', { name: 'Повторение' });
    expect(active.className).toMatch(/font-bold/);
    expect(active.className).toMatch(/underline/);

    const inactive = nav.getByRole('link', { name: 'Импорт' });
    expect(inactive.className).not.toMatch(/font-bold/);
  });

  it('clicking "Импорт" switches Outlet to import-stub', async () => {
    const user = userEvent.setup();
    renderLayout('/review');

    expect(screen.getByText('review-stub')).toBeInTheDocument();

    await user.click(within(getDesktopNav()).getByRole('link', { name: 'Импорт' }));

    expect(screen.getByText('import-stub')).toBeInTheDocument();
    expect(screen.queryByText('review-stub')).not.toBeInTheDocument();

    const activeNow = within(getDesktopNav()).getByRole('link', { name: 'Импорт' });
    expect(activeNow.className).toMatch(/font-bold/);
  });
});
