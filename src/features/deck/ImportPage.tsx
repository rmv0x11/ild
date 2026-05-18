import { useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { Download, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import type { CsvRow } from '@/types/domain';
import { parseDeckCsv, SAMPLE_CSV } from '@/lib/csv/parser';
import { addCards, clearAll } from '@/lib/storage/cards';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

interface ParsedState {
  rows: CsvRow[];
  errors: { line: number; message: string }[];
  fileName: string;
}

interface ImportResult {
  added: number;
  skipped: number;
}

export function ImportPage() {
  const [parsed, setParsed] = useState<ParsedState | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const handleFile = async (file: File): Promise<void> => {
    setError(null);
    setResult(null);
    try {
      const text = await file.text();
      const parseResult = parseDeckCsv(text);
      setParsed({
        rows: parseResult.rows,
        errors: parseResult.errors,
        fileName: file.name,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Не удалось прочитать файл';
      setError(message);
      setParsed(null);
    }
  };

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0];
    if (file) {
      void handleFile(file);
    }
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    setDragActive(false);
    const file = event.dataTransfer.files?.[0];
    if (file) {
      void handleFile(file);
    }
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    setDragActive(true);
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    setDragActive(false);
  };

  const handleImport = async (): Promise<void> => {
    if (!parsed || parsed.rows.length === 0) return;
    setImporting(true);
    try {
      const res = await addCards(parsed.rows, Date.now());
      setResult(res);
      setParsed(null);
      if (inputRef.current) inputRef.current.value = '';
      toast.success(`Добавлено: ${res.added}, пропущено: ${res.skipped}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Не удалось импортировать колоду';
      setError(message);
      toast.error(`Не удалось импортировать: ${message}`);
    } finally {
      setImporting(false);
    }
  };

  const handleDownloadSample = (): void => {
    const blob = new Blob([SAMPLE_CSV], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ild-sample.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success('Файл ild-sample.csv загружен');
  };

  const handleClear = async (): Promise<void> => {
    if (!window.confirm('Удалить все карточки? Это действие необратимо.')) return;
    try {
      await clearAll();
      setResult(null);
      setParsed(null);
      toast.success('Колода очищена');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Не удалось очистить колоду';
      setError(message);
      toast.error(`Ошибка очистки: ${message}`);
    }
  };

  const previewRows = parsed?.rows.slice(0, 5) ?? [];

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Импорт колоды CSV</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            className={cn(
              'flex flex-col items-center gap-2 rounded-md border-2 border-dashed border-input p-6 text-center transition-colors',
              dragActive && 'border-primary bg-accent',
            )}
          >
            <Upload className="text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Перетащите CSV-файл сюда или выберите вручную.
            </p>
            <Label htmlFor="csv-input" className="sr-only">
              Выберите CSV
            </Label>
            <Input
              id="csv-input"
              ref={inputRef}
              type="file"
              accept=".csv,text/csv"
              onChange={handleInputChange}
              className="max-w-sm"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={handleDownloadSample}>
              <Download />
              Скачать пример CSV
            </Button>
            <Button variant="destructive" onClick={handleClear}>
              <Trash2 />
              Очистить колоду
            </Button>
          </div>

          {error && (
            <div className="rounded-md border border-destructive bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          {result && (
            <div className="rounded-md border bg-muted px-3 py-2 text-sm">
              Добавлено: <strong>{result.added}</strong> · пропущено{' '}
              <strong>{result.skipped}</strong>
            </div>
          )}
        </CardContent>
      </Card>

      {parsed && (
        <Card>
          <CardHeader>
            <CardTitle>
              Превью: {parsed.fileName}{' '}
              <span className="text-sm font-normal text-muted-foreground">
                ({parsed.rows.length} строк, {parsed.errors.length} ошибок)
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {previewRows.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="px-2 py-1 font-medium">Слово</th>
                      <th className="px-2 py-1 font-medium">Пиньинь</th>
                      <th className="px-2 py-1 font-medium">Контекст</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((row, i) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="px-2 py-1 align-top font-medium">{row.word}</td>
                        <td className="px-2 py-1 align-top text-muted-foreground">
                          {row.pinyin}
                        </td>
                        <td className="px-2 py-1 align-top">{row.context}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Не нашли валидных строк.</p>
            )}

            {parsed.errors.length > 0 && (
              <div className="rounded-md border bg-muted px-3 py-2 text-sm">
                <div className="mb-1 font-medium">Ошибки:</div>
                <ul className="list-inside list-disc space-y-0.5 text-muted-foreground">
                  {parsed.errors.slice(0, 10).map((e, i) => (
                    <li key={i}>
                      Строка {e.line}: {e.message}
                    </li>
                  ))}
                  {parsed.errors.length > 10 && (
                    <li>…и ещё {parsed.errors.length - 10}</li>
                  )}
                </ul>
              </div>
            )}

            <div>
              <Button
                onClick={handleImport}
                disabled={importing || parsed.rows.length === 0}
              >
                {importing ? 'Импорт…' : 'Импортировать'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
