import type { Language } from '@/types/domain';
import type { ParseResult } from '@/lib/csv/parser';
import { parseDeckCsv } from '@/lib/csv/parser';

export type PresetCategory = 'topic' | 'hsk' | 'topik';

export interface Preset {
  id: string;
  name: string;
  description: string;
  category: PresetCategory;
  /** Study language this deck belongs to. */
  lang: Language;
  /** Approximate card count for display before fetching the CSV. */
  approxCards: number;
  /** Filename inside `/decks/` (no leading slash). Korean decks live under `ko/`. */
  file: string;
}

export const PRESETS: Preset[] = [
  {
    id: 'hsk-1',
    name: 'HSK 1',
    description:
      '150 слов первого уровня экзамена HSK — местоимения, числа, базовые глаголы и приветствия.',
    category: 'hsk',
    lang: 'zh',
    approxCards: 150,
    file: 'hsk-1.csv',
  },
  {
    id: 'hsk-2',
    name: 'HSK 2',
    description:
      '150 новых слов HSK 2 поверх HSK 1: бытовые глаголы, временные выражения, прилагательные.',
    category: 'hsk',
    lang: 'zh',
    approxCards: 150,
    file: 'hsk-2.csv',
  },
  {
    id: 'hsk-3',
    name: 'HSK 3',
    description: '200 новых слов HSK 3: понятия, эмоции, связи между предложениями.',
    category: 'hsk',
    lang: 'zh',
    approxCards: 200,
    file: 'hsk-3.csv',
  },
  {
    id: 'hsk-4',
    name: 'HSK 4',
    description:
      'HSK 4 — ~750 новых слов: абстрактные понятия, расширенные глаголы и прилагательные.',
    category: 'hsk',
    lang: 'zh',
    approxCards: 750,
    file: 'hsk-4.csv',
  },
  {
    id: 'hsk-5',
    name: 'HSK 5',
    description: 'HSK 5 — ~1300 новых слов: ситуации, отношения, новостной лексикон.',
    category: 'hsk',
    lang: 'zh',
    approxCards: 1300,
    file: 'hsk-5.csv',
  },
  {
    id: 'hsk-6',
    name: 'HSK 6',
    description: 'HSK 6 — 300 продвинутых слов и чэнъюй для подготовки к экзамену уровня C2.',
    category: 'hsk',
    lang: 'zh',
    approxCards: 300,
    file: 'hsk-6.csv',
  },
  {
    id: 'topic-numbers-time',
    name: 'Числа и время',
    description: 'Цифры, дни недели, части суток, месяцы, выражения времени.',
    category: 'topic',
    lang: 'zh',
    approxCards: 65,
    file: 'topic-numbers-time.csv',
  },
  {
    id: 'topic-food',
    name: 'Еда и напитки',
    description: 'Основные блюда, овощи, фрукты, напитки, ресторанные слова.',
    category: 'topic',
    lang: 'zh',
    approxCards: 65,
    file: 'topic-food.csv',
  },
  {
    id: 'topic-family',
    name: 'Семья и люди',
    description: 'Родственники, старшие и младшие, бабушки-дедушки по линиям, друзья и коллеги.',
    category: 'topic',
    lang: 'zh',
    approxCards: 55,
    file: 'topic-family.csv',
  },
  {
    id: 'topic-travel',
    name: 'Путешествия',
    description: 'Транспорт, билеты, гостиницы, направления, ориентирование.',
    category: 'topic',
    lang: 'zh',
    approxCards: 50,
    file: 'topic-travel.csv',
  },
  {
    id: 'topic-body-health',
    name: 'Тело и здоровье',
    description: 'Части тела, симптомы, поход к врачу, здоровый образ жизни.',
    category: 'topic',
    lang: 'zh',
    approxCards: 60,
    file: 'topic-body-health.csv',
  },

  // --- Корейский ---
  // Курируемые высокочастотные наборы, сгруппированные по уровням экзамена
  // TOPIK. Официального пословного списка TOPIK не существует, поэтому это
  // выверенные частотные подборки, соответствующие уровню сложности.
  {
    id: 'topik-1',
    name: 'TOPIK 1',
    description:
      'TOPIK I, уровень 1: приветствия, местоимения, числа, базовые глаголы и существительные.',
    category: 'topik',
    lang: 'ko',
    approxCards: 55,
    file: 'ko/topik-1.csv',
  },
  {
    id: 'topik-2',
    name: 'TOPIK 2',
    description: 'TOPIK I, уровень 2: повседневная жизнь, покупки, время, погода, транспорт.',
    category: 'topik',
    lang: 'ko',
    approxCards: 55,
    file: 'ko/topik-2.csv',
  },
  {
    id: 'topik-3',
    name: 'TOPIK 3',
    description: 'TOPIK II, уровень 3: работа, чувства, мнения, планы и связки предложений.',
    category: 'topik',
    lang: 'ko',
    approxCards: 55,
    file: 'ko/topik-3.csv',
  },
  {
    id: 'topik-4',
    name: 'TOPIK 4',
    description: 'TOPIK II, уровень 4: общество, культура, хобби, здоровье, абстрактные понятия.',
    category: 'topik',
    lang: 'ko',
    approxCards: 55,
    file: 'ko/topik-4.csv',
  },
  {
    id: 'topik-5',
    name: 'TOPIK 5',
    description: 'TOPIK II, уровень 5: новости, экономика, окружающая среда, формальная лексика.',
    category: 'topik',
    lang: 'ko',
    approxCards: 50,
    file: 'ko/topik-5.csv',
  },
  {
    id: 'topik-6',
    name: 'TOPIK 6',
    description: 'TOPIK II, уровень 6: продвинутая, академическая и абстрактная лексика.',
    category: 'topik',
    lang: 'ko',
    approxCards: 50,
    file: 'ko/topik-6.csv',
  },
  {
    id: 'ko-numbers-time',
    name: 'Числа и время',
    description: 'Сино-корейские и исконные числа, счётные слова, дни недели, части суток.',
    category: 'topic',
    lang: 'ko',
    approxCards: 48,
    file: 'ko/ko-numbers-time.csv',
  },
  {
    id: 'ko-food',
    name: 'Еда и напитки',
    description: 'Блюда, рис и гарниры, напитки, ресторанные слова.',
    category: 'topic',
    lang: 'ko',
    approxCards: 52,
    file: 'ko/ko-food.csv',
  },
  {
    id: 'ko-family',
    name: 'Семья и люди',
    description: 'Родственники, обращения, друзья и коллеги.',
    category: 'topic',
    lang: 'ko',
    approxCards: 46,
    file: 'ko/ko-family.csv',
  },
  {
    id: 'ko-travel',
    name: 'Путешествия',
    description: 'Транспорт, билеты, гостиница, направления и ориентирование.',
    category: 'topic',
    lang: 'ko',
    approxCards: 46,
    file: 'ko/ko-travel.csv',
  },
  {
    id: 'ko-body-health',
    name: 'Тело и здоровье',
    description: 'Части тела, симптомы, врач и аптека, здоровье.',
    category: 'topic',
    lang: 'ko',
    approxCards: 46,
    file: 'ko/ko-body-health.csv',
  },
];

export function getPreset(id: string): Preset | undefined {
  return PRESETS.find((p) => p.id === id);
}

export function getPresetsForLanguage(lang: Language): Preset[] {
  return PRESETS.filter((p) => p.lang === lang);
}

function presetUrl(file: string): string {
  const base = (import.meta.env.BASE_URL ?? '/').replace(/\/$/, '');
  return `${base}/decks/${file}`;
}

export async function loadPresetCsv(preset: Preset): Promise<ParseResult> {
  const url = presetUrl(preset.file);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Не удалось загрузить набор "${preset.name}" (HTTP ${res.status})`);
  }
  const text = await res.text();
  return parseDeckCsv(text);
}
