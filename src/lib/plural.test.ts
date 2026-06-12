import { describe, expect, it } from 'vitest';
import { plural } from '@/lib/plural';

const FORMS: [string, string, string] = ['карточка', 'карточки', 'карточек'];

describe('plural', () => {
  it.each([
    [1, 'карточка'],
    [2, 'карточки'],
    [5, 'карточек'],
    [11, 'карточек'],
    [21, 'карточка'],
    [101, 'карточка'],
  ])('plural(%i) → %s', (n, expected) => {
    expect(plural(n, FORMS)).toBe(expected);
  });
});
