const STORAGE_KEY = 'ild.onboarding.completed';

function hasWindow(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

export function isOnboardingCompleted(): boolean {
  if (!hasWindow()) return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function markOnboardingCompleted(): void {
  if (!hasWindow()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, 'true');
  } catch {
    // ignore quota / privacy mode errors
  }
}

export function resetOnboarding(): void {
  if (!hasWindow()) return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
