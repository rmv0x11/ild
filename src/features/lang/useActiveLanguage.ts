import { useEffect, useState } from 'react';
import type { Language } from '@/types/domain';
import {
  getActiveLanguage,
  setActiveLanguage,
  subscribeActiveLanguage,
} from '@/lib/lang/activeLanguage';

/**
 * React hook around the active-language setting. Returns the current language
 * and a setter that persists it and notifies every other subscriber on the page
 * — so the header switcher, the review queue and the deck list all stay in sync
 * without prop drilling.
 */
export function useActiveLanguage(): [Language, (lang: Language) => void] {
  const [lang, setLangState] = useState<Language>(() => getActiveLanguage());

  useEffect(() => {
    return subscribeActiveLanguage(() => {
      setLangState(getActiveLanguage());
    });
  }, []);

  return [lang, setActiveLanguage];
}
