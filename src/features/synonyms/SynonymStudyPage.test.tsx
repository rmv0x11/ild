import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { SynonymCsvRow } from '@/types/domain';
import { db } from '@/lib/storage/db';
import { importSynonymDeck } from '@/lib/storage/synonyms';
import { SynonymStudyPage } from './SynonymStudyPage';

const ROWS: SynonymCsvRow[] = [
  { word: '高兴', synonym: '开心', explanation: '**高兴** — нейтральное, **开心** — разговорное.' },
  {
    word: '认为',
    synonym: '以为',
    explanation: '**认为** — считать, **以为** — ошибочно полагать.',
  },
  {
    word: '帮助',
    synonym: '帮忙',
    explanation: '**帮助** — глагол и сущ., **帮忙** — отделяемый.',
  },
];

function renderStudy(deckId: string) {
  return render(
    <MemoryRouter initialEntries={[`/synonyms/${deckId}`]}>
      <Routes>
        <Route path="/synonyms" element={<div>Список колод</div>} />
        <Route path="/synonyms/:deckId" element={<SynonymStudyPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

async function seedDeck(rows: SynonymCsvRow[] = ROWS): Promise<string> {
  const { deckId } = await importSynonymDeck({ name: 'Тестовая', rows, now: 1000 });
  return deckId;
}

type User = ReturnType<typeof userEvent.setup>;

/** Проходит текущую карточку: шаг 1 → 2 → 3 → ответ. Возвращает показанное слово. */
async function answerCurrentCard(user: User, answer: 'Знаю' | 'Не знаю'): Promise<string> {
  const wordEl = await screen.findByTestId('syn-word');
  const word = wordEl.textContent ?? '';
  await user.click(screen.getByRole('button', { name: 'Показать синоним' }));
  await user.click(await screen.findByRole('button', { name: 'Показать разницу' }));
  await user.click(await screen.findByRole('button', { name: answer }));
  return word;
}

/** Проходит текущую карточку только клавиатурой: Space → Space → '1' / '2'. */
async function answerCurrentCardByKeyboard(user: User, key: '1' | '2'): Promise<void> {
  await screen.findByTestId('syn-word');
  await user.keyboard(' ');
  await screen.findByTestId('syn-synonym');
  await user.keyboard(' ');
  await screen.findByTestId('syn-explanation');
  await user.keyboard(key);
}

describe('SynonymStudyPage', () => {
  beforeEach(async () => {
    await db.synonymCards.clear();
    await db.synonymDecks.clear();
    await db.reviews.clear();
  });

  it('показывает сообщение, если колода не найдена', async () => {
    renderStudy('nope');
    await screen.findByText('Колода не найдена');
    expect(screen.getByRole('link', { name: /К списку колод/ })).toHaveAttribute(
      'href',
      '/synonyms',
    );
  });

  it('шаг 1: только слово, без пиньиня, синонима и TTS', async () => {
    const deckId = await seedDeck([ROWS[0]]);
    renderStudy(deckId);

    const wordEl = await screen.findByTestId('syn-word');
    expect(wordEl).toHaveTextContent('高兴');
    expect(screen.getByRole('button', { name: 'Показать синоним' })).toBeInTheDocument();

    // синоним скрыт до шага 2
    expect(screen.queryByText('开心')).not.toBeInTheDocument();
    // никакого пиньиня и озвучки из SM-2-режима
    expect(screen.queryByRole('button', { name: 'Показать пиньинь' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /озвучк/i })).not.toBeInTheDocument();
  });

  it('проходит шаги 1 → 2 → 3', async () => {
    const deckId = await seedDeck([ROWS[0]]);
    const user = userEvent.setup();
    renderStudy(deckId);

    // Шаг 1 → 2: появляется синоним с подписью
    await user.click(await screen.findByRole('button', { name: 'Показать синоним' }));
    expect(screen.getByTestId('syn-synonym')).toHaveTextContent('开心');
    expect(screen.getByText('синоним')).toBeInTheDocument();

    // Шаг 2 → 3: объяснение с **жирным** и кнопки ответа
    await user.click(screen.getByRole('button', { name: 'Показать разницу' }));
    const explanation = await screen.findByTestId('syn-explanation');
    expect(explanation).toHaveTextContent('нейтральное');
    expect(explanation.querySelector('strong')?.textContent).toBe('高兴');
    expect(screen.getByRole('button', { name: 'Знаю' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Не знаю' })).toBeInTheDocument();
  });

  it('«Знаю» для всех карточек ведёт на финальный экран; db.reviews пуста', async () => {
    const deckId = await seedDeck();
    const user = userEvent.setup();
    renderStudy(deckId);

    await answerCurrentCard(user, 'Знаю');
    await answerCurrentCard(user, 'Знаю');
    await answerCurrentCard(user, 'Знаю');

    await screen.findByText('Вся колода отмечена «Знаю»!');
    expect(screen.getByText(/за 1 раунд/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Пройти ещё раз' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'К колодам' })).toHaveAttribute('href', '/synonyms');

    // Quizlet-режим не пишет в SM-2 журнал
    expect(await db.reviews.count()).toBe(0);
  });

  it('«Не знаю» для части: итог раунда, повтор только незнакомых, затем финал', async () => {
    const deckId = await seedDeck();
    const user = userEvent.setup();
    renderStudy(deckId);

    const missedWord = await answerCurrentCard(user, 'Не знаю');
    await answerCurrentCard(user, 'Знаю');
    await answerCurrentCard(user, 'Знаю');

    // Экран итога раунда с верными числами
    await screen.findByText('Раунд 1 завершён');
    expect(screen.getByTestId('round-known')).toHaveTextContent('2');
    expect(screen.getByTestId('round-missed')).toHaveTextContent('1');

    // Раунд 2 содержит только незнакомую карточку
    await user.click(screen.getByRole('button', { name: 'Повторить незнакомые (1)' }));
    const wordEl = await screen.findByTestId('syn-word');
    expect(wordEl).toHaveTextContent(missedWord);
    expect(screen.getByText(/Раунд 2/)).toBeInTheDocument();
    expect(screen.getByText(/1 \/ 1/)).toBeInTheDocument();

    // «Знаю» на последней → финальный экран за 2 раунда
    await answerCurrentCard(user, 'Знаю');
    await screen.findByText('Вся колода отмечена «Знаю»!');
    expect(screen.getByText(/за 2 раунда/)).toBeInTheDocument();

    expect(await db.reviews.count()).toBe(0);
  });

  it('клавиатура: Space ведёт шаги 1 → 2 → 3, «2» — знаю, «1» — не знаю', async () => {
    const deckId = await seedDeck();
    const user = userEvent.setup();
    renderStudy(deckId);

    // Первая карточка — «не знаю», остальные две — «знаю»
    await answerCurrentCardByKeyboard(user, '1');
    await answerCurrentCardByKeyboard(user, '2');
    await answerCurrentCardByKeyboard(user, '2');

    // Итог раунда: ровно одна карточка попала в «не знаю»
    await screen.findByText('Раунд 1 завершён');
    expect(screen.getByTestId('round-known')).toHaveTextContent('2');
    expect(screen.getByTestId('round-missed')).toHaveTextContent('1');
  });

  it('Enter с target=ссылка «Завершить» не двигает шаг', async () => {
    const deckId = await seedDeck([ROWS[0]]);
    const user = userEvent.setup();
    renderStudy(deckId);

    await screen.findByTestId('syn-word');
    const finishLink = screen.getByRole('link', { name: 'Завершить сессию' });

    // Шаг 1: Enter на ссылке не должен открыть синоним
    fireEvent.keyDown(finishLink, { key: 'Enter' });
    expect(screen.queryByTestId('syn-synonym')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Показать синоним' })).toBeInTheDocument();

    // Шаг 2: Enter на ссылке не должен открыть объяснение
    await user.keyboard(' ');
    await screen.findByTestId('syn-synonym');
    fireEvent.keyDown(finishLink, { key: 'Enter' });
    expect(screen.queryByTestId('syn-explanation')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Показать разницу' })).toBeInTheDocument();
  });

  it('«Пройти ещё раз» запускает новую сессию с первого раунда', async () => {
    const deckId = await seedDeck([ROWS[0], ROWS[1]]);
    const user = userEvent.setup();
    renderStudy(deckId);

    await answerCurrentCard(user, 'Знаю');
    await answerCurrentCard(user, 'Знаю');
    await screen.findByText('Вся колода отмечена «Знаю»!');

    await user.click(screen.getByRole('button', { name: 'Пройти ещё раз' }));
    await screen.findByTestId('syn-word');
    expect(screen.getByText(/Раунд 1/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Показать синоним' })).toBeInTheDocument();
  });
});
