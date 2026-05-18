import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Node 25 ships an experimental built-in `localStorage` global which, when no
// `--localstorage-file` is provided, exists but does NOT expose
// getItem/setItem/clear. It also shadows jsdom's window.localStorage. Install
// a small in-memory polyfill so tests can rely on the standard Storage API.
function installMemoryLocalStorage(): void {
  const store = new Map<string, string>();
  const memoryStorage: Storage = {
    get length() {
      return store.size;
    },
    clear(): void {
      store.clear();
    },
    getItem(key: string): string | null {
      return store.has(key) ? (store.get(key) as string) : null;
    },
    key(index: number): string | null {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string): void {
      store.delete(key);
    },
    setItem(key: string, value: string): void {
      store.set(key, String(value));
    },
  };
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: memoryStorage,
  });
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: memoryStorage,
  });
}

if (typeof window !== 'undefined' && typeof window.localStorage?.getItem !== 'function') {
  installMemoryLocalStorage();
}

afterEach(() => {
  cleanup();
});
