import { useState } from 'react';
import { Download, GraduationCap, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getPresetsForLanguage, loadPresetCsv, type Preset } from '@/lib/presets';
import { getLanguageMeta } from '@/lib/lang/language';
import { addCards } from '@/lib/storage/cards';
import { useActiveLanguage } from '@/features/lang/useActiveLanguage';

interface PresetGalleryProps {
  onAfterImport?: () => void;
}

export function PresetGallery({ onAfterImport }: PresetGalleryProps) {
  const [lang] = useActiveLanguage();
  const meta = getLanguageMeta(lang);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const handleLoad = async (preset: Preset): Promise<void> => {
    setLoadingId(preset.id);
    try {
      const parsed = await loadPresetCsv(preset);
      if (parsed.rows.length === 0) {
        toast.error(`Не удалось загрузить набор «${preset.name}»: пустой CSV или ошибки разбора.`);
        return;
      }
      const res = await addCards(parsed.rows, Date.now(), {
        deckId: preset.id,
        lang: preset.lang,
      });
      toast.success(
        `«${preset.name}»: добавлено ${res.added}, пропущено (дубликаты) ${res.skipped}.`,
      );
      onAfterImport?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Неизвестная ошибка';
      toast.error(`Ошибка загрузки «${preset.name}»: ${message}`);
    } finally {
      setLoadingId(null);
    }
  };

  const presets = getPresetsForLanguage(lang);
  const exam = presets.filter((p) => p.category === 'hsk' || p.category === 'topik');
  const topics = presets.filter((p) => p.category === 'topic');

  return (
    <Card>
      <CardHeader>
        <CardTitle>Готовые наборы · {meta.name}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {exam.length > 0 && (
          <Section
            icon={<GraduationCap className="h-4 w-4" />}
            title={meta.examSectionTitle}
            items={exam}
            loadingId={loadingId}
            onLoad={handleLoad}
          />
        )}
        {topics.length > 0 && (
          <Section
            icon={<Sparkles className="h-4 w-4" />}
            title="Тематические наборы"
            items={topics}
            loadingId={loadingId}
            onLoad={handleLoad}
          />
        )}
      </CardContent>
    </Card>
  );
}

interface SectionProps {
  icon: React.ReactNode;
  title: string;
  items: Preset[];
  loadingId: string | null;
  onLoad: (p: Preset) => void;
}

function Section({ icon, title, items, loadingId, onLoad }: SectionProps) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-muted-foreground flex items-center gap-2 text-sm font-semibold">
        {icon}
        {title}
      </h3>
      <ul className="grid gap-2 sm:grid-cols-2">
        {items.map((p) => {
          const isLoading = loadingId === p.id;
          const anyLoading = loadingId !== null;
          return (
            <li
              key={p.id}
              className="bg-card flex flex-col gap-2 rounded-md border p-3 text-sm"
              data-preset-id={p.id}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="font-medium">{p.name}</div>
                <Badge variant="outline" className="shrink-0">
                  ~{p.approxCards}
                </Badge>
              </div>
              <p className="text-muted-foreground text-xs">{p.description}</p>
              <div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onLoad(p)}
                  disabled={anyLoading}
                  aria-busy={isLoading}
                >
                  <Download />
                  {isLoading ? 'Загрузка…' : 'Загрузить'}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
