import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PRESETS } from '@/lib/presets';
import * as presetsModule from '@/lib/presets';
import * as cardsModule from '@/lib/storage/cards';
import { PresetGallery } from './PresetGallery';

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe('PresetGallery', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders both HSK and topic sections', () => {
    render(<PresetGallery />);
    expect(screen.getByText('Подготовка к HSK')).toBeInTheDocument();
    expect(screen.getByText('Тематические наборы')).toBeInTheDocument();
  });

  it('renders every registered preset by name', () => {
    render(<PresetGallery />);
    for (const p of PRESETS) {
      expect(screen.getByText(p.name)).toBeInTheDocument();
    }
  });

  it('clicking "Загрузить" on a preset calls loadPresetCsv + addCards', async () => {
    const user = userEvent.setup();
    const loadSpy = vi
      .spyOn(presetsModule, 'loadPresetCsv')
      .mockResolvedValue({
        rows: [{ word: '你好', pinyin: 'nǐ hǎo', context: '**你好** → Привет.' }],
        errors: [],
      });
    const addSpy = vi
      .spyOn(cardsModule, 'addCards')
      .mockResolvedValue({ added: 1, skipped: 0 });

    render(<PresetGallery />);
    const hskItem = screen.getByText(PRESETS[0].name).closest('li');
    expect(hskItem).not.toBeNull();
    const loadBtn = hskItem!.querySelector('button');
    expect(loadBtn).not.toBeNull();
    await user.click(loadBtn!);

    await waitFor(() => {
      expect(loadSpy).toHaveBeenCalledTimes(1);
      expect(loadSpy.mock.calls[0][0].id).toBe(PRESETS[0].id);
      expect(addSpy).toHaveBeenCalledTimes(1);
    });
  });

  it('shows error toast when the CSV fails to load', async () => {
    const { toast } = await import('sonner');
    const user = userEvent.setup();
    vi.spyOn(presetsModule, 'loadPresetCsv').mockRejectedValue(new Error('boom'));

    render(<PresetGallery />);
    const item = screen.getByText(PRESETS[0].name).closest('li');
    const loadBtn = item!.querySelector('button')!;
    await user.click(loadBtn);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('boom'));
    });
  });
});
