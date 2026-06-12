import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { SynonymCsvRow } from '@/types/domain';
import { db } from '@/lib/storage/db';
import { importSynonymDeck } from '@/lib/storage/synonyms';
import { SynonymDecksPage } from './SynonymDecksPage';

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

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/synonyms']}>
      <SynonymDecksPage />
    </MemoryRouter>,
  );
}

function makeCsvFile(text: string, name = 'мои-синонимы.csv'): File {
  return new File([text], name, { type: 'text/csv' });
}

/** Подменяет глобальный fetch успешным ответом с данным CSV (как в lib/presets/*.test.ts). */
function stubFetchWithCsv(csv: string) {
  const fetchMock = vi.fn<(input: RequestInfo | URL) => Promise<Response>>(
    async () =>
      ({
        ok: true,
        status: 200,
        text: async () => csv,
      }) as unknown as Response,
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('SynonymDecksPage', () => {
  beforeEach(async () => {
    await db.synonymCards.clear();
    await db.synonymDecks.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('показывает пустое состояние, когда колод нет', async () => {
    renderPage();
    await screen.findByText('Синонимических колод пока нет');
    expect(screen.getByText('Добавить колоду')).toBeInTheDocument();
  });

  it('показывает колоду с именем, числом карточек и ссылкой «Учить»', async () => {
    const { deckId } = await importSynonymDeck({ name: 'Моя колода', rows: ROWS, now: 1000 });
    renderPage();

    await screen.findByText('Моя колода');
    expect(screen.getByText('3 карточки')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Учить Моя колода' })).toHaveAttribute(
      'href',
      `/synonyms/${deckId}`,
    );
  });

  it('удаление с подтверждением убирает колоду из списка и из БД', async () => {
    await importSynonymDeck({ name: 'Удаляемая', rows: ROWS, now: 1000 });
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderPage();

    await screen.findByText('Удаляемая');
    await user.click(screen.getByRole('button', { name: 'Удалить Удаляемая' }));

    await waitFor(() => expect(screen.queryByText('Удаляемая')).not.toBeInTheDocument());
    expect(await db.synonymDecks.count()).toBe(0);
    expect(await db.synonymCards.count()).toBe(0);

    confirmSpy.mockRestore();
  });

  it('отмена подтверждения оставляет колоду на месте', async () => {
    await importSynonymDeck({ name: 'Остаётся', rows: ROWS, now: 1000 });
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderPage();

    await screen.findByText('Остаётся');
    await user.click(screen.getByRole('button', { name: 'Удалить Остаётся' }));

    expect(await db.synonymDecks.count()).toBe(1);
    expect(screen.getByText('Остаётся')).toBeInTheDocument();

    confirmSpy.mockRestore();
  });

  it('импортирует CSV-файл: колода с именем файла без расширения и итог импорта', async () => {
    const user = userEvent.setup();
    renderPage();

    const csv =
      'word,synonym,explanation\n高兴,开心,почти одно и то же\n认为,以为,считать vs ошибочно полагать\n';
    const input = screen.getByLabelText('Выберите CSV');
    await user.upload(input, makeCsvFile(csv));

    await screen.findByText(/добавлено/);
    expect(screen.getByText('Колода «мои-синонимы»:', { exact: false })).toBeInTheDocument();
    await screen.findByText('мои-синонимы');
    expect(screen.getByText('2 карточки')).toBeInTheDocument();
    expect(await db.synonymCards.count()).toBe(2);
  });

  it('пресет «Добавить»: создаёт колоду, повторный клик пропускает дубликаты', async () => {
    const csv =
      'word,synonym,explanation\n爱惜,珍惜,беречь vs дорожить\n高兴,开心,нейтральное vs разговорное\n';
    stubFetchWithCsv(csv);
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Добавить Синонимы HSK' }));

    // Колода появилась в списке с числом карточек
    const deckItem = await screen.findByTestId('synonym-deck-syn-hsk');
    expect(within(deckItem).getByText('Синонимы HSK')).toBeInTheDocument();
    expect(within(deckItem).getByText('2 карточки')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/добавлено 2.*пропущено 0/);

    // Повторный клик: все строки уже есть — added=0, skipped=2
    await user.click(screen.getByRole('button', { name: 'Добавить Синонимы HSK' }));
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(/добавлено 0.*пропущено 2/),
    );
    expect(await db.synonymCards.count()).toBe(2);
  });

  it('пресет «Добавить»: ошибка сети показывается в блоке role="alert"', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('Сеть недоступна'))),
    );
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Добавить Синонимы HSK' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Ошибка загрузки «Синонимы HSK»: Сеть недоступна');
    expect(await db.synonymDecks.count()).toBe(0);
  });

  it('показывает ошибки разбора CSV с номерами строк (первые 5)', async () => {
    const user = userEvent.setup();
    renderPage();

    // строка 2 без synonym и explanation -> ошибки с номером строки 2
    const csv = 'word,synonym,explanation\n高兴,,\n认为,以为,объяснение\n';
    const input = screen.getByLabelText('Выберите CSV');
    await user.upload(input, makeCsvFile(csv));

    await screen.findByText('Ошибки разбора:');
    expect(screen.getAllByText(/Строка 2/).length).toBeGreaterThan(0);
    // валидная строка всё равно импортируется
    expect(await db.synonymCards.count()).toBe(1);
  });
});
