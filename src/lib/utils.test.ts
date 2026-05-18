import { describe, expect, it } from 'vitest';
import { cn } from './utils';

describe('cn', () => {
  it('returns a single class unchanged', () => {
    expect(cn('px-2')).toBe('px-2');
  });

  it('joins an array of classes', () => {
    expect(cn(['a', 'b'])).toBe('a b');
  });

  it('skips falsy values (false / null / undefined)', () => {
    const off = false as boolean;
    expect(cn('a', off && 'b', null, undefined, 'c')).toBe('a c');
  });

  it('lets tailwind-merge win conflicts (later wins on same family)', () => {
    expect(cn('px-2 py-1', 'px-4')).toBe('py-1 px-4');
  });

  it('supports object syntax via clsx', () => {
    expect(cn({ active: true, hidden: false })).toBe('active');
  });

  it('returns empty string when no truthy inputs are provided', () => {
    expect(cn()).toBe('');
    expect(cn(false, null, undefined)).toBe('');
  });

  it('merges mixed input forms', () => {
    const off = false as boolean;
    expect(cn('a', ['b', off && 'skip'], { c: true, d: false }, undefined)).toBe('a b c');
  });
});
