import type { Card, CardStage, Rating } from '@/types/domain';
import { DAY_MS, MINUTE_MS, SM2_DEFAULTS } from './constants';

export function createNewCard(
  input: { word: string; pinyin: string; context: string },
  now: number,
): Card {
  return {
    id: crypto.randomUUID(),
    word: input.word,
    pinyin: input.pinyin,
    context: input.context,
    stage: 'new',
    learningStep: 0,
    intervalDays: 0,
    ease: SM2_DEFAULTS.initialEase,
    dueAt: now,
    reps: 0,
    lapses: 0,
    createdAt: now,
    updatedAt: now,
  };
}

export function isCardDue(card: Card, now: number): boolean {
  return card.dueAt <= now;
}

export function nextStageFromInterval(intervalDays: number): 'young' | 'mature' {
  return intervalDays >= SM2_DEFAULTS.matureThresholdDays ? 'mature' : 'young';
}

function clampEase(ease: number): number {
  return Math.max(SM2_DEFAULTS.minEase, ease);
}

function adjustEase(ease: number, rating: Rating): number {
  return clampEase(ease + SM2_DEFAULTS.easeAdjustments[rating]);
}

function rateLearning(card: Card, rating: Rating, now: number): Card {
  const steps = SM2_DEFAULTS.learningStepsMinutes;
  switch (rating) {
    case 'again':
      return {
        ...card,
        stage: 'learning',
        learningStep: 0,
        dueAt: now + 1 * MINUTE_MS,
        updatedAt: now,
      };
    case 'hard':
      return {
        ...card,
        stage: 'learning',
        learningStep: Math.max(card.learningStep, 1),
        dueAt: now + 5 * MINUTE_MS,
        updatedAt: now,
      };
    case 'good': {
      const nextStep = card.learningStep + 1;
      if (nextStep >= steps.length) {
        // Graduate to young
        const intervalDays = SM2_DEFAULTS.graduatingIntervalDays;
        return {
          ...card,
          stage: 'young',
          learningStep: 0,
          intervalDays,
          dueAt: now + intervalDays * DAY_MS,
          reps: card.reps + 1,
          updatedAt: now,
        };
      }
      return {
        ...card,
        stage: 'learning',
        learningStep: nextStep,
        dueAt: now + steps[nextStep] * MINUTE_MS,
        updatedAt: now,
      };
    }
    case 'easy': {
      const intervalDays = SM2_DEFAULTS.easyIntervalDays;
      return {
        ...card,
        stage: 'young',
        learningStep: 0,
        intervalDays,
        ease: adjustEase(card.ease, 'easy'),
        dueAt: now + intervalDays * DAY_MS,
        reps: card.reps + 1,
        updatedAt: now,
      };
    }
  }
}

function rateRelearning(card: Card, rating: Rating, now: number): Card {
  const steps = SM2_DEFAULTS.relearningStepsMinutes;
  switch (rating) {
    case 'again':
      return {
        ...card,
        stage: 'relearning',
        learningStep: 0,
        dueAt: now + steps[0] * MINUTE_MS,
        updatedAt: now,
      };
    case 'hard':
      return {
        ...card,
        stage: 'relearning',
        learningStep: Math.max(card.learningStep, 1),
        dueAt: now + steps[1] * MINUTE_MS,
        updatedAt: now,
      };
    case 'good': {
      const nextStep = card.learningStep + 1;
      if (nextStep >= steps.length) {
        const intervalDays = SM2_DEFAULTS.graduatingIntervalDays;
        return {
          ...card,
          stage: 'young',
          learningStep: 0,
          intervalDays,
          dueAt: now + intervalDays * DAY_MS,
          reps: card.reps + 1,
          updatedAt: now,
        };
      }
      return {
        ...card,
        stage: 'relearning',
        learningStep: nextStep,
        dueAt: now + steps[nextStep] * MINUTE_MS,
        updatedAt: now,
      };
    }
    case 'easy': {
      const intervalDays = SM2_DEFAULTS.easyIntervalDays;
      return {
        ...card,
        stage: 'young',
        learningStep: 0,
        intervalDays,
        ease: adjustEase(card.ease, 'easy'),
        dueAt: now + intervalDays * DAY_MS,
        reps: card.reps + 1,
        updatedAt: now,
      };
    }
  }
}

function rateReview(card: Card, rating: Rating, now: number): Card {
  // stage === 'young' | 'mature'
  if (rating === 'again') {
    if (card.stage === 'mature') {
      // Mature reset: erase history, back to 'new'
      return {
        ...card,
        stage: 'new',
        learningStep: 0,
        intervalDays: 0,
        ease: SM2_DEFAULTS.initialEase,
        dueAt: now,
        lapses: card.lapses + 1,
        updatedAt: now,
      };
    }
    // Young again -> relearning
    return {
      ...card,
      stage: 'relearning',
      learningStep: 0,
      intervalDays: 0,
      ease: adjustEase(card.ease, 'again'),
      lapses: card.lapses + 1,
      dueAt: now + SM2_DEFAULTS.relearningStepsMinutes[0] * MINUTE_MS,
      updatedAt: now,
    };
  }

  const newEase = adjustEase(card.ease, rating);
  let rawInterval: number;
  switch (rating) {
    case 'hard':
      rawInterval = card.intervalDays * SM2_DEFAULTS.hardIntervalMultiplier;
      break;
    case 'good':
      rawInterval = card.intervalDays * newEase;
      break;
    case 'easy':
      rawInterval = card.intervalDays * newEase * SM2_DEFAULTS.easyBonus;
      break;
    default:
      rawInterval = card.intervalDays;
  }
  const intervalDays = Math.max(1, Math.round(rawInterval));
  const nextStage: CardStage = nextStageFromInterval(intervalDays);
  return {
    ...card,
    stage: nextStage,
    learningStep: 0,
    intervalDays,
    ease: newEase,
    dueAt: now + intervalDays * DAY_MS,
    reps: card.reps + 1,
    updatedAt: now,
  };
}

export function rateCard(card: Card, rating: Rating, now: number): Card {
  if (card.stage === 'new' || card.stage === 'learning') {
    return rateLearning(card, rating, now);
  }
  if (card.stage === 'relearning') {
    return rateRelearning(card, rating, now);
  }
  return rateReview(card, rating, now);
}
