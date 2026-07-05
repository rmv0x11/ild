import { LANGUAGES, LANGUAGE_META } from '@/lib/lang/language';
import { cn } from '@/lib/utils';
import { useActiveLanguage } from './useActiveLanguage';

/**
 * Compact segmented control that switches the whole app between study
 * languages. Flags stay visible everywhere; the language name shows from `sm`
 * up. Lives in the header so it's reachable from every screen.
 */
export function LanguageSwitcher({ className }: { className?: string }) {
  const [lang, setLang] = useActiveLanguage();

  return (
    <div
      role="group"
      aria-label="Язык обучения"
      className={cn(
        'bg-muted/60 inline-flex items-center gap-0.5 rounded-full border p-0.5',
        className,
      )}
    >
      {LANGUAGES.map((code) => {
        const meta = LANGUAGE_META[code];
        const active = code === lang;
        return (
          <button
            key={code}
            type="button"
            onClick={() => setLang(code)}
            aria-pressed={active}
            title={meta.name}
            className={cn(
              'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm font-medium transition-colors',
              active
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <span aria-hidden className="text-base leading-none">
              {meta.flag}
            </span>
            <span className="hidden sm:inline">{meta.name}</span>
          </button>
        );
      })}
    </div>
  );
}
