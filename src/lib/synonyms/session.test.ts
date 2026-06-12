import { describe, expect, it } from 'vitest';
import type { SynonymSessionState } from './session';
import {
  answerCurrent,
  isRoundFinished,
  isSessionFinished,
  nextRound,
  startSession,
} from './session';

/** Object.freeze поверхностный — замораживаем и вложенные массивы,
 * чтобы любая мутация состояния бросала TypeError в strict mode. */
function deepFreeze(s: SynonymSessionState): SynonymSessionState {
  Object.freeze(s.queue);
  Object.freeze(s.missed);
  return Object.freeze(s);
}

describe('startSession', () => {
  it('initializes the state from card ids', () => {
    const ids = ['a', 'b', 'c'];
    const s = startSession(ids);
    expect(s).toEqual({
      queue: ['a', 'b', 'c'],
      index: 0,
      round: 1,
      missed: [],
      knownThisRound: 0,
      initialCount: 3,
    });
    // queue — копия, а не та же ссылка
    expect(s.queue).not.toBe(ids);
  });

  it('an empty session is finished immediately', () => {
    const s = startSession([]);
    expect(isRoundFinished(s)).toBe(true);
    expect(isSessionFinished(s)).toBe(true);
  });
});

describe('answerCurrent', () => {
  it('all "know" answers finish the session after one round', () => {
    let s = startSession(['a', 'b']);
    s = answerCurrent(s, 'know');
    expect(s.knownThisRound).toBe(1);
    expect(isRoundFinished(s)).toBe(false);

    s = answerCurrent(s, 'know');
    expect(s.knownThisRound).toBe(2);
    expect(s.missed).toEqual([]);
    expect(isRoundFinished(s)).toBe(true);
    expect(isSessionFinished(s)).toBe(true);
  });

  it('collects "dont-know" cards into missed in the order they were marked', () => {
    let s = startSession(['a', 'b', 'c', 'd']);
    s = answerCurrent(s, 'dont-know'); // a
    s = answerCurrent(s, 'know'); // b
    s = answerCurrent(s, 'dont-know'); // c
    s = answerCurrent(s, 'know'); // d
    expect(s.missed).toEqual(['a', 'c']);
    expect(s.knownThisRound).toBe(2);
    expect(isRoundFinished(s)).toBe(true);
    expect(isSessionFinished(s)).toBe(false);
  });

  it('is a no-op after the round is finished', () => {
    let s = startSession(['a']);
    s = answerCurrent(s, 'know');
    const after = answerCurrent(s, 'dont-know');
    expect(after).toBe(s);
  });

  it('does not mutate the input state', () => {
    const s = deepFreeze(startSession(['a', 'b']));
    const next = answerCurrent(s, 'dont-know');
    expect(next).not.toBe(s);
    expect(s.index).toBe(0);
    expect(s.missed).toEqual([]);
    expect(next.index).toBe(1);
    expect(next.missed).toEqual(['a']);
  });
});

describe('nextRound', () => {
  it('starts a new round only with the missed cards', () => {
    let s = startSession(['a', 'b', 'c']);
    s = answerCurrent(s, 'dont-know');
    s = answerCurrent(s, 'know');
    s = answerCurrent(s, 'dont-know');

    const r2 = nextRound(s);
    expect(r2.queue).toEqual(['a', 'c']);
    expect(r2.index).toBe(0);
    expect(r2.round).toBe(2);
    expect(r2.missed).toEqual([]);
    expect(r2.knownThisRound).toBe(0);
    expect(r2.initialCount).toBe(3);
  });

  it('is a no-op while the round is not finished', () => {
    let s = startSession(['a', 'b']);
    s = answerCurrent(s, 'dont-know');
    expect(nextRound(s)).toBe(s);
  });

  it('is a no-op when missed is empty', () => {
    let s = startSession(['a']);
    s = answerCurrent(s, 'know');
    expect(nextRound(s)).toBe(s);
  });

  it('does not mutate the input state', () => {
    let s = startSession(['a', 'b']);
    s = answerCurrent(s, 'dont-know');
    s = answerCurrent(s, 'dont-know');
    const frozen = deepFreeze(s);

    const r2 = nextRound(frozen);
    expect(r2.queue).toEqual(['a', 'b']);
    // очередь нового раунда — копия missed, а не та же ссылка
    expect(r2.queue).not.toBe(frozen.missed);
    expect(frozen.round).toBe(1);
  });
});

describe('полная сессия за несколько раундов', () => {
  it('converges when every card is eventually marked "know"', () => {
    // Раунд 1: a — знаю, b и c — не знаю
    let s = startSession(['a', 'b', 'c']);
    s = answerCurrent(s, 'know');
    s = answerCurrent(s, 'dont-know');
    s = answerCurrent(s, 'dont-know');
    expect(isSessionFinished(s)).toBe(false);

    // Раунд 2: b — не знаю, c — знаю
    s = nextRound(s);
    expect(s.queue).toEqual(['b', 'c']);
    s = answerCurrent(s, 'dont-know');
    s = answerCurrent(s, 'know');
    expect(isRoundFinished(s)).toBe(true);
    expect(isSessionFinished(s)).toBe(false);

    // Раунд 3: остался только b
    s = nextRound(s);
    expect(s.queue).toEqual(['b']);
    expect(s.round).toBe(3);
    s = answerCurrent(s, 'know');
    expect(isSessionFinished(s)).toBe(true);
    expect(s.initialCount).toBe(3);
  });
});
