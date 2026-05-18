import { useCallback, useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import type { Card as DomainCard } from '@/types/domain';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { updateCardFields } from './cardActions';

export interface EditCardDialogProps {
  card: DomainCard;
  onClose: () => void;
}

export function EditCardDialog({ card, onClose }: EditCardDialogProps) {
  const [word, setWord] = useState(card.word);
  const [pinyin, setPinyin] = useState(card.pinyin);
  const [context, setContext] = useState(card.context);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClose = useCallback(() => {
    if (saving) return;
    onClose();
  }, [onClose, saving]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        handleClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleClose]);

  const handleSave = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await updateCardFields(card.id, {
        word: word.trim(),
        pinyin: pinyin.trim(),
        context,
      });
      toast.success('Сохранено');
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Не удалось сохранить';
      setError(message);
      toast.error(`Ошибка: ${message}`);
    } finally {
      setSaving(false);
    }
  }, [card.id, word, pinyin, context, onClose, saving]);

  const wordChanged = word.trim() !== card.word;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-card-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div className="w-full max-w-md rounded-lg border bg-card text-card-foreground shadow-lg">
        <div className="flex items-center justify-between border-b p-4">
          <h2 id="edit-card-title" className="text-lg font-semibold">
            Редактирование карточки
          </h2>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Закрыть"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X />
          </button>
        </div>

        <div className="flex flex-col gap-4 p-6">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-word">Слово</Label>
            <Input
              id="edit-word"
              value={word}
              onChange={(e) => setWord(e.target.value)}
              disabled={saving}
            />
            {wordChanged && (
              <p className="text-xs text-amber-700 dark:text-amber-400">
                Изменение слова создаст «новую» запись для синхронизации.
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-pinyin">Пиньинь</Label>
            <Input
              id="edit-pinyin"
              value={pinyin}
              onChange={(e) => setPinyin(e.target.value)}
              disabled={saving}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-context">Контекст</Label>
            <textarea
              id="edit-context"
              value={context}
              onChange={(e) => setContext(e.target.value)}
              disabled={saving}
              rows={4}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>

          {error && (
            <div className="rounded-md border border-destructive bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t p-4">
          <Button variant="outline" onClick={handleClose} disabled={saving}>
            Отмена
          </Button>
          <Button onClick={() => void handleSave()} disabled={saving || word.trim() === ''}>
            {saving ? 'Сохранение…' : 'Сохранить'}
          </Button>
        </div>
      </div>
    </div>
  );
}
