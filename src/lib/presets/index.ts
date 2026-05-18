import type { ParseResult } from '@/lib/csv/parser';
import { parseDeckCsv } from '@/lib/csv/parser';

export type PresetCategory = 'topic' | 'hsk';

export interface Preset {
  id: string;
  name: string;
  description: string;
  category: PresetCategory;
  /** Approximate card count for display before fetching the CSV. */
  approxCards: number;
  /** Filename inside `/decks/` (no leading slash). */
  file: string;
}

export const PRESETS: Preset[] = [
  {
    id: 'hsk-1',
    name: 'HSK 1',
    description: '150 слов первого уровня экзамена HSK — местоимения, числа, базовые глаголы и приветствия.',
    category: 'hsk',
    approxCards: 150,
    file: 'hsk-1.csv',
  },
  {
    id: 'hsk-2',
    name: 'HSK 2',
    description: '150 новых слов HSK 2 поверх HSK 1: бытовые глаголы, временные выражения, прилагательные.',
    category: 'hsk',
    approxCards: 150,
    file: 'hsk-2.csv',
  },
  {
    id: 'hsk-3',
    name: 'HSK 3',
    description: '200 новых слов HSK 3: понятия, эмоции, связи между предложениями.',
    category: 'hsk',
    approxCards: 200,
    file: 'hsk-3.csv',
  },
  {
    id: 'hsk-4',
    name: 'HSK 4',
    description: 'HSK 4 — ~750 новых слов: абстрактные понятия, расширенные глаголы и прилагательные.',
    category: 'hsk',
    approxCards: 750,
    file: 'hsk-4.csv',
  },
  {
    id: 'hsk-5',
    name: 'HSK 5',
    description: 'HSK 5 — ~1300 новых слов: ситуации, отношения, новостной лексикон.',
    category: 'hsk',
    approxCards: 1300,
    file: 'hsk-5.csv',
  },
  {
    id: 'hsk-6',
    name: 'HSK 6',
    description: 'HSK 6 — 300 продвинутых слов и чэнъюй для подготовки к экзамену уровня C2.',
    category: 'hsk',
    approxCards: 300,
    file: 'hsk-6.csv',
  },
  {
    id: 'topic-numbers-time',
    name: 'Числа и время',
    description: 'Цифры, дни недели, части суток, месяцы, выражения времени.',
    category: 'topic',
    approxCards: 65,
    file: 'topic-numbers-time.csv',
  },
  {
    id: 'topic-food',
    name: 'Еда и напитки',
    description: 'Основные блюда, овощи, фрукты, напитки, ресторанные слова.',
    category: 'topic',
    approxCards: 65,
    file: 'topic-food.csv',
  },
  {
    id: 'topic-family',
    name: 'Семья и люди',
    description: 'Родственники, старшие и младшие, бабушки-дедушки по линиям, друзья и коллеги.',
    category: 'topic',
    approxCards: 55,
    file: 'topic-family.csv',
  },
  {
    id: 'topic-travel',
    name: 'Путешествия',
    description: 'Транспорт, билеты, гостиницы, направления, ориентирование.',
    category: 'topic',
    approxCards: 50,
    file: 'topic-travel.csv',
  },
  {
    id: 'topic-body-health',
    name: 'Тело и здоровье',
    description: 'Части тела, симптомы, поход к врачу, здоровый образ жизни.',
    category: 'topic',
    approxCards: 60,
    file: 'topic-body-health.csv',
  },
];

export function getPreset(id: string): Preset | undefined {
  return PRESETS.find((p) => p.id === id);
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
