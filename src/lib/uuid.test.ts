import { afterEach, describe, expect, it, vi } from 'vitest';
import { uuid } from './uuid';

const V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('uuid', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('returns a v4-shaped string via native crypto.randomUUID', () => {
    const id = uuid();
    expect(typeof id).toBe('string');
    expect(id).toMatch(V4_REGEX);
  });

  it('produces different ids on consecutive calls', () => {
    const a = uuid();
    const b = uuid();
    expect(a).not.toBe(b);
  });

  it('falls back to getRandomValues when randomUUID is missing and yields a valid v4', () => {
    // Replace crypto without randomUUID; deterministic bytes [0..15]
    vi.stubGlobal('crypto', {
      getRandomValues: <T extends ArrayBufferView>(bytes: T): T => {
        const view = bytes as unknown as Uint8Array;
        for (let i = 0; i < view.length; i++) view[i] = i;
        return bytes;
      },
    });

    const id = uuid();
    expect(id).toMatch(V4_REGEX);

    // With input bytes 0..15:
    // bytes[6] becomes (0x06 & 0x0f) | 0x40 = 0x46
    // bytes[8] becomes (0x08 & 0x3f) | 0x80 = 0x88
    // Hex layout: 00010203-0405-4607-8809-0a0b0c0d0e0f
    expect(id).toBe('00010203-0405-4607-8809-0a0b0c0d0e0f');

    // The 13th hex character (start of group 3) must be '4'
    expect(id[14]).toBe('4');
    // The 17th hex character (start of group 4) must be 8/9/a/b
    expect(['8', '9', 'a', 'b']).toContain(id[19].toLowerCase());
  });

  it('fallback still produces unique ids across calls when bytes change', () => {
    let counter = 0;
    vi.stubGlobal('crypto', {
      getRandomValues: <T extends ArrayBufferView>(bytes: T): T => {
        const view = bytes as unknown as Uint8Array;
        for (let i = 0; i < view.length; i++) view[i] = (counter + i) & 0xff;
        counter += 1;
        return bytes;
      },
    });
    const a = uuid();
    const b = uuid();
    expect(a).toMatch(V4_REGEX);
    expect(b).toMatch(V4_REGEX);
    expect(a).not.toBe(b);
  });
});
