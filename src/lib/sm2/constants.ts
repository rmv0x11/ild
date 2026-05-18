export const SM2_DEFAULTS = {
  initialEase: 2.5,
  minEase: 1.3,
  learningStepsMinutes: [1, 5, 20] as const,
  relearningStepsMinutes: [10, 1, 5, 20] as const,
  graduatingIntervalDays: 1,
  easyIntervalDays: 4,
  matureThresholdDays: 21,
  easyBonus: 1.3,
  hardIntervalMultiplier: 1.2,
  easeAdjustments: { again: -0.2, hard: -0.15, good: 0, easy: 0.15 },
} as const;

export const MINUTE_MS = 60_000;
export const DAY_MS = 86_400_000;
