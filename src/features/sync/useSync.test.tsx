import { act, render, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetSyncStateForTests } from './store';

vi.mock('./engine', () => ({
  syncOnce: vi.fn(),
  start: vi.fn(() => () => {}),
  getPendingCounts: vi.fn(async () => ({ cards: 0, reviews: 0 })),
  SyncUnauthorizedError: class extends Error {
    constructor() {
      super('unauthorized');
      this.name = 'SyncUnauthorizedError';
    }
  },
}));

vi.mock('./meta', async () => {
  const actual = (await vi.importActual('./meta')) as Record<string, unknown>;
  return {
    ...actual,
    getMeta: vi.fn(async () => null),
  };
});

import * as engine from './engine';
import { useSync } from './useSync';
import { SyncIndicator } from './SyncIndicator';

const mockedSyncOnce = vi.mocked(engine.syncOnce);
const mockedStart = vi.mocked(engine.start);

function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  vi.clearAllMocks();
  __resetSyncStateForTests();
  mockedSyncOnce.mockResolvedValue(undefined);
  mockedStart.mockReturnValue(() => {});
});

afterEach(() => {
  __resetSyncStateForTests();
});

describe('useSync', () => {
  it('starts the engine when enabled and skips it when disabled', async () => {
    const { rerender, unmount } = renderHook(({ enabled }: { enabled: boolean }) => useSync({ enabled }), {
      initialProps: { enabled: false },
    });
    expect(mockedStart).not.toHaveBeenCalled();

    rerender({ enabled: true });
    await flushPromises();
    expect(mockedStart).toHaveBeenCalledTimes(1);

    unmount();
  });

  it('triggers a manual sync via syncNow() and transitions through syncing → idle', async () => {
    let resolveSync: (() => void) | undefined;
    mockedSyncOnce.mockImplementation(
      () => new Promise<void>((resolve) => {
        resolveSync = () => resolve();
      }),
    );

    const { result } = renderHook(() => useSync({ enabled: true }));
    // The initial kick fires synchronously inside the effect.
    await waitFor(() => expect(mockedSyncOnce).toHaveBeenCalled());
    expect(result.current.state.status).toBe('syncing');

    await act(async () => {
      resolveSync?.();
      await flushPromises();
    });

    expect(result.current.state.status).toBe('idle');
  });

  it('puts state into error when engine throws', async () => {
    mockedSyncOnce.mockRejectedValueOnce(new Error('boom'));

    const { result } = renderHook(() => useSync({ enabled: true }));

    await waitFor(() => expect(result.current.state.status).toBe('error'));
    expect(result.current.state.error).toBe('boom');
  });
});

describe('SyncIndicator', () => {
  it('renders the syncing label while a sync is in progress', async () => {
    let resolveSync: (() => void) | undefined;
    mockedSyncOnce.mockImplementation(
      () => new Promise<void>((resolve) => {
        resolveSync = () => resolve();
      }),
    );

    renderHook(() => useSync({ enabled: true }));
    const { container } = render(<SyncIndicator />);
    await waitFor(() => expect(container.textContent).toContain('Синхронизация'));

    await act(async () => {
      resolveSync?.();
      await flushPromises();
    });
  });

  it('renders the error label and a retry button on error', async () => {
    mockedSyncOnce.mockRejectedValueOnce(new Error('nope'));

    renderHook(() => useSync({ enabled: true }));
    const { container, findByRole } = render(<SyncIndicator />);

    await waitFor(() => expect(container.textContent).toContain('nope'));
    const retry = await findByRole('button', { name: 'Повторить синхронизацию' });
    expect(retry).toBeInTheDocument();
  });
});
