import { useLiveQuery } from 'dexie-react-hooks';
import { Layers } from 'lucide-react';
import { getKnownDeckIds } from '@/lib/storage/cards';
import { DECK_ALL } from '@/lib/storage/deckFilter';
import { getPreset } from '@/lib/presets';
import { useDeckFilter } from './useDeckFilter';

/**
 * Compact dropdown that scopes Review / Practice / Stats to a single deck
 * (preset id). Hidden when the user has zero tagged cards — there is nothing
 * to filter by in that case.
 */
export function DeckSelector() {
  const [filter, setFilter] = useDeckFilter();
  const knownIds = useLiveQuery(() => getKnownDeckIds(), []);

  if (knownIds === undefined) return null;
  if (knownIds.length === 0) return null;

  return (
    <label className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
      <Layers className="h-4 w-4" />
      <span>Колода:</span>
      <select
        aria-label="Выбор колоды"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="rounded border bg-background px-2 py-1 text-sm"
        data-testid="deck-selector"
      >
        <option value={DECK_ALL}>Все колоды</option>
        {knownIds.map((id) => {
          const preset = getPreset(id);
          const label = preset?.name ?? id;
          return (
            <option key={id} value={id}>
              {label}
            </option>
          );
        })}
      </select>
    </label>
  );
}
