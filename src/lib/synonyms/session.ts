import type { SynonymAnswer } from '@/types/domain';

/**
 * Чистая state-machine сессии изучения синонимической колоды в стиле Quizlet:
 * проходим очередь карточек, отмечая «Знаю» / «Не знаю»; после конца раунда
 * новый раунд собирается только из «Не знаю» — и так до полной сходимости.
 * Без I/O, без Date.now и random; входное состояние никогда не мутируется.
 */
export interface SynonymSessionState {
  /** Очередь id карточек текущего раунда. */
  queue: string[];
  /** Индекс текущей карточки в queue. */
  index: number;
  /** Номер раунда, начиная с 1. */
  round: number;
  /** Id карточек, отмеченных «Не знаю» в текущем раунде (в порядке отметки). */
  missed: string[];
  /** Сколько карточек отмечено «Знаю» в текущем раунде. */
  knownThisRound: number;
  /** Размер исходной колоды (первого раунда). */
  initialCount: number;
}

export function startSession(cardIds: string[]): SynonymSessionState {
  return {
    queue: cardIds.slice(),
    index: 0,
    round: 1,
    missed: [],
    knownThisRound: 0,
    initialCount: cardIds.length,
  };
}

export function answerCurrent(s: SynonymSessionState, answer: SynonymAnswer): SynonymSessionState {
  if (isRoundFinished(s)) return s;
  return {
    ...s,
    index: s.index + 1,
    missed: answer === 'dont-know' ? [...s.missed, s.queue[s.index]] : s.missed,
    knownThisRound: answer === 'know' ? s.knownThisRound + 1 : s.knownThisRound,
  };
}

export function isRoundFinished(s: SynonymSessionState): boolean {
  return s.index >= s.queue.length;
}

export function isSessionFinished(s: SynonymSessionState): boolean {
  return isRoundFinished(s) && s.missed.length === 0;
}

export function nextRound(s: SynonymSessionState): SynonymSessionState {
  if (!isRoundFinished(s) || s.missed.length === 0) return s;
  return {
    queue: s.missed.slice(),
    index: 0,
    round: s.round + 1,
    missed: [],
    knownThisRound: 0,
    initialCount: s.initialCount,
  };
}
