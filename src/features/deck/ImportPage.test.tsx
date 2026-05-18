import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { db } from '@/lib/storage/db';
import * as cardsRepo from '@/lib/storage/cards';
import { clearAll } from '@/lib/storage/cards';
import { ImportPage } from './ImportPage';

function makeCsvFile(text: string, name = 'd.csv'): File {
  return new File([text], name, { type: 'text/csv' });
}

describe('ImportPage', () => {
  beforeEach(async () => {
    await clearAll();
  });

  it('renders headings and main action buttons', () => {
    render(<ImportPage />);
    expect(screen.getByText('Импорт колоды CSV')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Скачать пример CSV/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Очистить колоду/ })).toBeInTheDocument();
  });

  it('previews uploaded CSV rows and imports them into the deck', async () => {
    const user = userEvent.setup();
    render(<ImportPage />);

    const csv = 'word,pinyin,context\n你好,nǐ hǎo,a\n谢谢,xiè xie,b\n';
    const fileInput = screen.getByLabelText('Выберите CSV') as HTMLInputElement;
    await user.upload(fileInput, makeCsvFile(csv));

    // preview shows up
    await screen.findByText('你好');
    expect(screen.getByText('谢谢')).toBeInTheDocument();

    const importBtn = screen.getByRole('button', { name: /Импортировать/ });
    await user.click(importBtn);

    // success message
    await screen.findByText(/Добавлено:/);
    expect(screen.getByText('2')).toBeInTheDocument();

    // preview disappears after import
    expect(screen.queryByText('Превью:', { exact: false })).not.toBeInTheDocument();

    // and DB has 2 cards
    expect(await db.cards.count()).toBe(2);
  });

  it('clears the deck via the confirm prompt', async () => {
    const user = userEvent.setup();

    // pre-seed a card directly
    await db.cards.put({
      id: 'pre-1',
      word: 'pre',
      pinyin: 'pre',
      context: 'pre',
      stage: 'new',
      learningStep: 0,
      intervalDays: 0,
      ease: 2.5,
      dueAt: 0,
      reps: 0,
      lapses: 0,
      createdAt: 0,
      updatedAt: 0,
    });
    expect(await db.cards.count()).toBe(1);

    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<ImportPage />);

    await user.click(screen.getByRole('button', { name: /Очистить колоду/ }));

    await waitFor(async () => {
      expect(await db.cards.count()).toBe(0);
    });

    confirmSpy.mockRestore();
  });

  it('shows errors block with the line number for malformed rows', async () => {
    const user = userEvent.setup();
    render(<ImportPage />);

    // first data row has empty word -> error on line 2
    const csv = 'word,pinyin,context\n,nopinyin,c\n好,hǎo,ok\n';
    const fileInput = screen.getByLabelText('Выберите CSV') as HTMLInputElement;
    await user.upload(fileInput, makeCsvFile(csv));

    await screen.findByText('好');
    expect(screen.getByText('Ошибки:')).toBeInTheDocument();
    // line number 2 shows up in the error list
    expect(screen.getByText(/Строка 2/)).toBeInTheDocument();
  });

  it('cancels clearing when the user dismisses the confirm prompt', async () => {
    const user = userEvent.setup();

    await db.cards.put({
      id: 'keep-1',
      word: 'keep',
      pinyin: 'keep',
      context: 'keep',
      stage: 'new',
      learningStep: 0,
      intervalDays: 0,
      ease: 2.5,
      dueAt: 0,
      reps: 0,
      lapses: 0,
      createdAt: 0,
      updatedAt: 0,
    });

    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<ImportPage />);

    await user.click(screen.getByRole('button', { name: /Очистить колоду/ }));

    expect(await db.cards.count()).toBe(1);
    confirmSpy.mockRestore();
  });

  it('shows an error if addCards throws during import', async () => {
    const user = userEvent.setup();
    const spy = vi
      .spyOn(cardsRepo, 'addCards')
      .mockRejectedValueOnce(new Error('boom-import'));

    render(<ImportPage />);
    const csv = 'word,pinyin,context\n你好,nǐ hǎo,a\n';
    const fileInput = screen.getByLabelText('Выберите CSV') as HTMLInputElement;
    await user.upload(fileInput, new File([csv], 'd.csv', { type: 'text/csv' }));
    await screen.findByText('你好');
    await user.click(screen.getByRole('button', { name: /Импортировать/ }));

    await screen.findByText(/boom-import/);
    spy.mockRestore();
  });

  it('shows an error if clearAll throws after confirming', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const clearSpy = vi
      .spyOn(cardsRepo, 'clearAll')
      .mockRejectedValueOnce(new Error('boom-clear'));

    render(<ImportPage />);
    await user.click(screen.getByRole('button', { name: /Очистить колоду/ }));

    await screen.findByText(/boom-clear/);

    confirmSpy.mockRestore();
    clearSpy.mockRestore();
  });

  it('triggers a CSV download when "Скачать пример CSV" is clicked', async () => {
    const user = userEvent.setup();

    const createUrlSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');
    const revokeUrlSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);

    render(<ImportPage />);
    await user.click(screen.getByRole('button', { name: /Скачать пример CSV/ }));

    expect(createUrlSpy).toHaveBeenCalledTimes(1);
    expect(createUrlSpy.mock.calls[0][0]).toBeInstanceOf(Blob);
    expect(clickSpy).toHaveBeenCalled();
    expect(revokeUrlSpy).toHaveBeenCalledWith('blob:mock');

    createUrlSpy.mockRestore();
    revokeUrlSpy.mockRestore();
    clickSpy.mockRestore();
  });
});
