import { useRef, useState, type ChangeEvent } from 'react';
import { Download } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { RestoreMode } from '@/lib/storage';
import { exportBackupFile, importBackupFile } from './backupFile';

export function BackupSection() {
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const handleExport = async (): Promise<void> => {
    setBusy(true);
    try {
      const { filename, shared } = await exportBackupFile(Date.now());
      toast.success(shared ? 'Резервная копия готова к сохранению' : `Сохранено: ${filename}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'ошибка';
      toast.error(`Не удалось сохранить копию: ${message}`);
    } finally {
      setBusy(false);
    }
  };

  const handleSelect = (event: ChangeEvent<HTMLInputElement>): void => {
    setFile(event.target.files?.[0] ?? null);
  };

  const handleRestore = async (mode: RestoreMode): Promise<void> => {
    if (!file) return;
    const what =
      mode === 'replace'
        ? 'заменит все текущие данные на содержимое файла'
        : 'добавит данные из файла к текущим';
    if (!window.confirm(`Восстановление ${what}. Продолжить?`)) return;

    setBusy(true);
    try {
      const res = await importBackupFile(file, mode);
      setFile(null);
      if (inputRef.current) inputRef.current.value = '';
      toast.success(
        `Восстановлено: ${res.cards} карт., ${res.reviews} ревью, ${res.synonymCards} синонимов`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'не удалось восстановить копию';
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Резервная копия</CardTitle>
        <CardDescription>
          Сохраните все карточки, историю повторений и синонимические колоды в файл — на
          случай очистки хранилища системой или переноса на другое устройство.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={handleExport} disabled={busy}>
            <Download />
            Сохранить копию
          </Button>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="backup-input" className="text-sm text-muted-foreground">
            Восстановить из файла
          </Label>
          <Input
            id="backup-input"
            ref={inputRef}
            type="file"
            accept="application/json,.json"
            onChange={handleSelect}
            className="max-w-sm"
            disabled={busy}
          />
          {file && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted-foreground">{file.name}</span>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => void handleRestore('replace')}
                disabled={busy}
              >
                Заменить всё
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void handleRestore('merge')}
                disabled={busy}
              >
                Объединить
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
