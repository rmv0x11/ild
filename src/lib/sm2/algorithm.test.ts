import type { Card } from '@/types/domain';
import {
  createNewCard,
  isCardDue,
  nextStageFromInterval,
  rateCard,
} from './algorithm';
import { DAY_MS, MINUTE_MS, SM2_DEFAULTS } from './constants';

const NOW = 1_700_000_000_000;

function makeNew(now = NOW): Card {
  return createNewCard(
    { word: '你好', pinyin: 'nǐ hǎo', context: 'hello world' },
    now,
  );
}

function makeYoung(intervalDays: number, overrides: Partial<Card> = {}): Card {
  return {
    ...makeNew(),
    stage: 'young',
    intervalDays,
    ease: SM2_DEFAULTS.initialEase,
    dueAt: NOW,
    reps: 1,
    ...overrides,
  };
}

function makeMature(intervalDays: number, overrides: Partial<Card> = {}): Card {
  return {
    ...makeNew(),
    stage: 'mature',
    intervalDays,
    ease: SM2_DEFAULTS.initialEase,
    dueAt: NOW,
    reps: 5,
    ...overrides,
  };
}

function makeRelearning(overrides: Partial<Card> = {}): Card {
  return {
    ...makeNew(),
    stage: 'relearning',
    learningStep: 0,
    intervalDays: 0,
    ease: SM2_DEFAULTS.initialEase - 0.2,
    dueAt: NOW,
    reps: 1,
    lapses: 1,
    ...overrides,
  };
}

describe('createNewCard', () => {
  it('returns a card with correct initial values', () => {
    const card = makeNew();
    expect(card.stage).toBe('new');
    expect(card.learningStep).toBe(0);
    expect(card.intervalDays).toBe(0);
    expect(card.ease).toBe(SM2_DEFAULTS.initialEase);
    expect(card.dueAt).toBe(NOW);
    expect(card.reps).toBe(0);
    expect(card.lapses).toBe(0);
    expect(card.createdAt).toBe(NOW);
    expect(card.updatedAt).toBe(NOW);
    expect(card.word).toBe('你好');
    expect(card.pinyin).toBe('nǐ hǎo');
    expect(card.context).toBe('hello world');
  });

  it('produces unique ids for different calls', () => {
    const ids = new Set(Array.from({ length: 50 }, () => makeNew().id));
    expect(ids.size).toBe(50);
  });
});

describe('isCardDue', () => {
  it('returns true when now equals dueAt', () => {
    const card = makeNew();
    expect(isCardDue(card, NOW)).toBe(true);
  });

  it('returns true when now is past dueAt', () => {
    const card = makeNew();
    expect(isCardDue(card, NOW + 1)).toBe(true);
  });

  it('returns false when now is before dueAt', () => {
    const card = { ...makeNew(), dueAt: NOW + 1000 };
    expect(isCardDue(card, NOW)).toBe(false);
  });
});

describe('nextStageFromInterval', () => {
  it('returns young below mature threshold', () => {
    expect(nextStageFromInterval(1)).toBe('young');
    expect(nextStageFromInterval(20)).toBe('young');
  });

  it('returns mature at and above threshold', () => {
    expect(nextStageFromInterval(21)).toBe('mature');
    expect(nextStageFromInterval(100)).toBe('mature');
  });
});

describe('rateCard learning stage', () => {
  it('new -> again: 1 minute, learningStep=0, stage=learning', () => {
    const card = makeNew();
    const result = rateCard(card, 'again', NOW);
    expect(result.stage).toBe('learning');
    expect(result.learningStep).toBe(0);
    expect(result.dueAt).toBe(NOW + MINUTE_MS);
    expect(result.intervalDays).toBe(0);
  });

  it('new -> hard: 5 minutes, learningStep=1, stage=learning', () => {
    const card = makeNew();
    const result = rateCard(card, 'hard', NOW);
    expect(result.stage).toBe('learning');
    expect(result.learningStep).toBe(1);
    expect(result.dueAt).toBe(NOW + 5 * MINUTE_MS);
  });

  it('new -> good: 5 minutes, learningStep=1', () => {
    const card = makeNew();
    const r1 = rateCard(card, 'good', NOW);
    expect(r1.stage).toBe('learning');
    expect(r1.learningStep).toBe(1);
    expect(r1.dueAt).toBe(NOW + 5 * MINUTE_MS);
  });

  it('progressive good: 5m -> 20m -> graduate young 1d', () => {
    let c = makeNew();
    c = rateCard(c, 'good', NOW);
    expect(c.dueAt).toBe(NOW + 5 * MINUTE_MS);
    expect(c.learningStep).toBe(1);

    c = rateCard(c, 'good', NOW);
    expect(c.stage).toBe('learning');
    expect(c.learningStep).toBe(2);
    expect(c.dueAt).toBe(NOW + 20 * MINUTE_MS);

    c = rateCard(c, 'good', NOW);
    expect(c.stage).toBe('young');
    expect(c.intervalDays).toBe(1);
    expect(c.learningStep).toBe(0);
    expect(c.dueAt).toBe(NOW + DAY_MS);
    expect(c.reps).toBe(1);
  });

  it('new -> easy: graduate to young with 4 day interval', () => {
    const card = makeNew();
    const result = rateCard(card, 'easy', NOW);
    expect(result.stage).toBe('young');
    expect(result.intervalDays).toBe(SM2_DEFAULTS.easyIntervalDays);
    expect(result.dueAt).toBe(NOW + 4 * DAY_MS);
    expect(result.reps).toBe(1);
    expect(result.ease).toBeCloseTo(
      SM2_DEFAULTS.initialEase + SM2_DEFAULTS.easeAdjustments.easy,
      6,
    );
  });
});

describe('rateCard young/mature stage', () => {
  it('young 1d + good -> ~3d (round of 2.5), stays young', () => {
    const card = makeYoung(1);
    const result = rateCard(card, 'good', NOW);
    expect(result.stage).toBe('young');
    // 1 * 2.5 = 2.5 -> round -> 3
    expect(result.intervalDays).toBe(3);
    expect(result.dueAt).toBe(NOW + 3 * DAY_MS);
  });

  it('young 8d + good -> 20d, still young', () => {
    const card = makeYoung(8);
    const result = rateCard(card, 'good', NOW);
    // 8 * 2.5 = 20
    expect(result.intervalDays).toBe(20);
    expect(result.stage).toBe('young');
  });

  it('young 8d -> good -> good crosses into mature (50d)', () => {
    let c = makeYoung(8);
    c = rateCard(c, 'good', NOW);
    expect(c.intervalDays).toBe(20);
    expect(c.stage).toBe('young');
    c = rateCard(c, 'good', NOW);
    // 20 * 2.5 = 50
    expect(c.intervalDays).toBe(50);
    expect(c.stage).toBe('mature');
    expect(c.dueAt).toBe(NOW + 50 * DAY_MS);
  });

  it('young + again -> relearning, +10 min, lapses+=1, ease -0.2', () => {
    const card = makeYoung(8);
    const result = rateCard(card, 'again', NOW);
    expect(result.stage).toBe('relearning');
    expect(result.dueAt).toBe(NOW + 10 * MINUTE_MS);
    expect(result.lapses).toBe(1);
    expect(result.ease).toBeCloseTo(SM2_DEFAULTS.initialEase - 0.2, 6);
    expect(result.learningStep).toBe(0);
    expect(result.intervalDays).toBe(0);
  });

  it('mature 30d + again -> reset to new, ease=initialEase, lapses+=1', () => {
    const card = makeMature(30, { ease: 2.1, lapses: 2 });
    const result = rateCard(card, 'again', NOW);
    expect(result.stage).toBe('new');
    expect(result.intervalDays).toBe(0);
    expect(result.ease).toBe(SM2_DEFAULTS.initialEase);
    expect(result.lapses).toBe(3);
    expect(result.dueAt).toBe(NOW);
    expect(result.learningStep).toBe(0);
  });

  it('hard on young 10d: ease -0.15, interval * 1.2 = 12d', () => {
    const card = makeYoung(10);
    const result = rateCard(card, 'hard', NOW);
    expect(result.ease).toBeCloseTo(SM2_DEFAULTS.initialEase - 0.15, 6);
    // 10 * 1.2 = 12
    expect(result.intervalDays).toBe(12);
    expect(result.stage).toBe('young');
  });

  it('easy on young 10d: ease +0.15, interval * ease * easyBonus', () => {
    const card = makeYoung(10);
    const result = rateCard(card, 'easy', NOW);
    const expectedEase = SM2_DEFAULTS.initialEase + 0.15; // 2.65
    expect(result.ease).toBeCloseTo(expectedEase, 6);
    // 10 * 2.65 * 1.3 = 34.45 -> round -> 34
    expect(result.intervalDays).toBe(Math.round(10 * expectedEase * 1.3));
    expect(result.stage).toBe('mature');
  });
});

describe('rateCard ease bounds', () => {
  it('ease never drops below minEase after multiple hard ratings', () => {
    let c = makeYoung(5, { ease: 1.4 });
    for (let i = 0; i < 20; i++) {
      c = rateCard(c, 'hard', NOW);
    }
    expect(c.ease).toBe(SM2_DEFAULTS.minEase);
    expect(c.ease).toBeGreaterThanOrEqual(SM2_DEFAULTS.minEase);
  });

  it('ease never drops below minEase after again on young', () => {
    const card = makeYoung(3, { ease: 1.4 });
    const result = rateCard(card, 'again', NOW);
    expect(result.ease).toBe(SM2_DEFAULTS.minEase);
  });

  it('young interval has minimum of 1 day', () => {
    // small intervalDays * small ease could round to 0; ensure floor is 1
    const card = makeYoung(1, { ease: SM2_DEFAULTS.minEase });
    const result = rateCard(card, 'hard', NOW);
    // 1 * 1.2 = 1.2 -> round -> 1
    expect(result.intervalDays).toBeGreaterThanOrEqual(1);
  });
});

describe('rateCard relearning stage', () => {
  it('relearning + good x 4 steps -> back to young 1d', () => {
    // relearningStepsMinutes = [10, 1, 5, 20], length=4
    let c = makeRelearning();
    // step 0 -> 1
    c = rateCard(c, 'good', NOW);
    expect(c.stage).toBe('relearning');
    expect(c.learningStep).toBe(1);
    expect(c.dueAt).toBe(NOW + 1 * MINUTE_MS);

    // step 1 -> 2
    c = rateCard(c, 'good', NOW);
    expect(c.stage).toBe('relearning');
    expect(c.learningStep).toBe(2);
    expect(c.dueAt).toBe(NOW + 5 * MINUTE_MS);

    // step 2 -> 3
    c = rateCard(c, 'good', NOW);
    expect(c.stage).toBe('relearning');
    expect(c.learningStep).toBe(3);
    expect(c.dueAt).toBe(NOW + 20 * MINUTE_MS);

    // step 3 -> graduate (nextStep=4 >= length=4)
    c = rateCard(c, 'good', NOW);
    expect(c.stage).toBe('young');
    expect(c.intervalDays).toBe(1);
    expect(c.dueAt).toBe(NOW + DAY_MS);
    expect(c.learningStep).toBe(0);
  });

  it('relearning + easy -> back to young with 4 day interval', () => {
    const card = makeRelearning();
    const result = rateCard(card, 'easy', NOW);
    expect(result.stage).toBe('young');
    expect(result.intervalDays).toBe(SM2_DEFAULTS.easyIntervalDays);
    expect(result.dueAt).toBe(NOW + 4 * DAY_MS);
  });

  it('relearning + again -> step 0, +10 min, lapses not double-counted', () => {
    const card = makeRelearning({ lapses: 1 });
    const result = rateCard(card, 'again', NOW);
    expect(result.stage).toBe('relearning');
    expect(result.learningStep).toBe(0);
    expect(result.dueAt).toBe(NOW + 10 * MINUTE_MS);
    expect(result.lapses).toBe(1); // unchanged - not a fresh lapse
  });

  it('relearning + hard -> learningStep=max(step,1), +1 min', () => {
    const card = makeRelearning();
    const result = rateCard(card, 'hard', NOW);
    expect(result.stage).toBe('relearning');
    expect(result.learningStep).toBe(1);
    expect(result.dueAt).toBe(NOW + 1 * MINUTE_MS);
  });
});

describe('rateCard purity', () => {
  it('does not mutate the input card', () => {
    const card = makeYoung(8);
    const snapshot = structuredClone(card);
    const result = rateCard(card, 'good', NOW);
    expect(card).toEqual(snapshot);
    expect(result).not.toBe(card);
  });

  it('does not mutate a frozen input', () => {
    const card = Object.freeze(makeYoung(8));
    expect(() => rateCard(card, 'again', NOW)).not.toThrow();
  });

  it('does not mutate a frozen new card across all ratings', () => {
    for (const rating of ['again', 'hard', 'good', 'easy'] as const) {
      const card = Object.freeze(makeNew());
      expect(() => rateCard(card, rating, NOW)).not.toThrow();
    }
  });

  it('updates updatedAt to now', () => {
    const card = makeYoung(8, { updatedAt: NOW - 1_000_000 });
    const later = NOW + 50_000;
    const result = rateCard(card, 'good', later);
    expect(result.updatedAt).toBe(later);
  });
});
