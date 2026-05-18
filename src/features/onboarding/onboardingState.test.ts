import { beforeEach, describe, expect, it } from 'vitest';
import {
  isOnboardingCompleted,
  markOnboardingCompleted,
  resetOnboarding,
} from './onboardingState';

describe('onboardingState', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('isOnboardingCompleted returns false by default', () => {
    expect(isOnboardingCompleted()).toBe(false);
  });

  it('returns true after markOnboardingCompleted', () => {
    markOnboardingCompleted();
    expect(isOnboardingCompleted()).toBe(true);
  });

  it('returns false again after resetOnboarding', () => {
    markOnboardingCompleted();
    expect(isOnboardingCompleted()).toBe(true);

    resetOnboarding();
    expect(isOnboardingCompleted()).toBe(false);
  });

  it('uses the "ild.onboarding.completed" key in localStorage', () => {
    markOnboardingCompleted();
    expect(localStorage.getItem('ild.onboarding.completed')).toBe('true');
  });
});
