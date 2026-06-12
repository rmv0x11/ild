import { useRef, useState, type ChangeEvent } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeftRight, Download, GraduationCap, Play, Trash2, Upload } from 'lucide-react';
import type { SynonymDeck } from '@/types/domain';
import { parseSynonymCsv, type ParseError } from '@/lib/csv/synonymParser';
import {
  deleteSynonymDeck,
  getSynonymDeckCounts,
  getSynonymDecks,
  importSynonymDeck,
} from '@/lib/storage/synonyms';
import { SYNONYM_PRESETS, loadSynonymPresetCsv, type SynonymPreset } from '@/lib/presets/synonyms';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { plural } from '@/lib/plural';

interface ImportResultState {
  name: string;
  added: number;
  skipped: number;
}

interface PresetListProps {
  loadingId: string | null;
  onAdd: (preset: SynonymPreset) => void;
}

function PresetList({ loadingId, onAdd }: PresetListProps) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-muted-foreground flex items-center gap-2 text-sm font-semibold">
        <GraduationCap className="h-4 w-4" />
        Готовые наборы
      </h3>
      <ul className="grid gap-2 sm:grid-cols-2">
        {SYNONYM_PRESETS.map((preset) => {
          const isLoading = loadingId === preset.id;
          return (
            <li
              key={preset.id}
              className="bg-card flex flex-col gap-2 rounded-md border p-3 text-sm"
              data-preset-id={preset.id}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="font-medium">{preset.name}</div>
                <Badge variant="outline" className="shrink-0">
                  ~{preset.approxCards}
                </Badge>
              </div>
              <p className="text-muted-foreground text-xs">{preset.description}</p>
              <div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onAdd(preset)}
                  disabled={loadingId !== null}
                  aria-busy={isLoading}
                  aria-label={`Добавить ${preset.name}`}
                >
                  <Download />
                  {isLoading ? 'Загрузка…' : 'Добавить'}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function SynonymDecksPage() {
  const data = useLiveQuery(async () => {
    const [decks, counts] = await Promise.all([getSynonymDecks(), getSynonymDeckCounts()]);
    return { decks, counts };
  }, []);

  const [loadingPresetId, setLoadingPresetId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResultState | null>(null);
  const [csvErrors, setCsvErrors] = useState<ParseError[]>([]);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const resetMessages = (): void => {
    setResult(null);
    setCsvErrors([]);
    setError(null);
  };

  const handleAddPreset = async (preset: SynonymPreset): Promise<void> => {
    resetMessages();
    setLoadingPresetId(preset.id);
    try {
      const parsed = await loadSynonymPresetCsv(preset);
      if (parsed.rows.length === 0) {
        setError(`Не удалось загрузить набор «${preset.name}»: пустой CSV или ошибки разбора.`);
        return;
      }
      const res = await importSynonymDeck({
        deckId: preset.id,
        name: preset.name,
        rows: parsed.rows,
        now: Date.now(),
      });
      setResult({ name: preset.name, added: res.added, skipped: res.skipped });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Неизвестная ошибка';
      setError(`Ошибка загрузки «${preset.name}»: ${message}`);
    } finally {
      setLoadingPresetId(null);
    }
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0];
    if (!file) return;
    resetMessages();
    setImporting(true);
    try {
      const text = await file.text();
      const parsed = parseSynonymCsv(text);
      if (parsed.errors.length > 0) {
        setCsvErrors(parsed.errors);
      }
      if (parsed.rows.length > 0) {
        const name = file.name.replace(/\.[^.]+$/, '') || file.name;
        const res = await importSynonymDeck({ name, rows: parsed.rows, now: Date.now() });
        setResult({ name, added: res.added, skipped: res.skipped });
      } else if (parsed.errors.length === 0) {
        setError('В файле не нашлось валидных строк.');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Не удалось прочитать файл';
      setError(message);
    } finally {
      setImporting(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const handleDelete = async (deck: SynonymDeck): Promise<void> => {
    if (!window.confirm(`Удалить колоду «${deck.name}» и все её карточки?`)) return;
    try {
      await deleteSynonymDeck(deck.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Не удалось удалить колоду';
      setError(`Ошибка удаления: ${message}`);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <ArrowLeftRight className="h-6 w-6" />
          Синонимы
        </h1>
        <p className="text-muted-foreground text-sm">
          Карточка из трёх сторон: слово → его синоним → разбор разницы значений. Оценивайте себя
          кнопками «Знаю» / «Не знаю» — незнакомые повторяются по кругу. Без SM-2 и без учёта в
          статистике обучения.
        </p>
      </div>

      {data === undefined ? (
        <div className="bg-muted h-24 animate-pulse rounded-lg" />
      ) : data.decks.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12">
            <div className="bg-muted rounded-full p-5">
              <ArrowLeftRight className="text-muted-foreground h-10 w-10" />
            </div>
            <div className="text-lg font-medium">Синонимических колод пока нет</div>
            <p className="text-muted-foreground text-center text-sm">
              Добавьте готовый набор или импортируйте свой CSV-файл ниже.
            </p>
          </CardContent>
        </Card>
      ) : (
        <ul className="flex flex-col gap-2">
          {data.decks.map((deck) => {
            const count = data.counts[deck.id] ?? 0;
            return (
              <li key={deck.id} data-testid={`synonym-deck-${deck.id}`}>
                <Card>
                  <CardContent className="flex items-center justify-between gap-3 p-4">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{deck.name}</div>
                      <div className="text-muted-foreground text-sm">
                        {count} {plural(count, ['карточка', 'карточки', 'карточек'])}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Link
                        to={`/synonyms/${deck.id}`}
                        className={buttonVariants({ variant: 'default', size: 'sm' })}
                        aria-label={`Учить ${deck.name}`}
                      >
                        <Play />
                        Учить
                      </Link>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Удалить ${deck.name}`}
                        onClick={() => void handleDelete(deck)}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Добавить колоду</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <PresetList loadingId={loadingPresetId} onAdd={(p) => void handleAddPreset(p)} />

          <section className="flex flex-col gap-2">
            <h3 className="text-muted-foreground flex items-center gap-2 text-sm font-semibold">
              <Upload className="h-4 w-4" />
              Импорт CSV
            </h3>
            <Label htmlFor="synonym-csv-input" className="sr-only">
              Выберите CSV
            </Label>
            <Input
              id="synonym-csv-input"
              ref={inputRef}
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => void handleFileChange(e)}
              disabled={importing}
              className="max-w-sm"
            />
            <p className="text-muted-foreground text-xs">
              Формат: колонки <code>word,synonym,explanation</code> (или{' '}
              <code>слово,синоним,объяснение</code>). Имя колоды — имя файла без расширения.
            </p>
          </section>

          {error && (
            <div
              role="alert"
              className="border-destructive bg-destructive/10 text-destructive rounded-md border px-3 py-2 text-sm"
            >
              {error}
            </div>
          )}

          {csvErrors.length > 0 && (
            <div role="status" className="bg-muted rounded-md border px-3 py-2 text-sm">
              <div className="mb-1 font-medium">Ошибки разбора:</div>
              <ul className="text-muted-foreground list-inside list-disc space-y-0.5">
                {csvErrors.slice(0, 5).map((e, i) => (
                  <li key={i}>
                    Строка {e.line}: {e.message}
                  </li>
                ))}
                {csvErrors.length > 5 && <li>…и ещё {csvErrors.length - 5}</li>}
              </ul>
            </div>
          )}

          {result && (
            <div role="status" className="bg-muted rounded-md border px-3 py-2 text-sm">
              Колода «{result.name}»: добавлено <strong>{result.added}</strong>, пропущено{' '}
              <strong>{result.skipped}</strong>.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
