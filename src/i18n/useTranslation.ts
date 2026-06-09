import { useSettingsStore } from '@/stores/settingsStore';
import { translations } from './index';
import type { TranslationKeys } from './index';

export function useTranslation() {
  const language = useSettingsStore(state => state.language);
  const t: TranslationKeys = translations[language] || translations.en;

  return { t, language };
}
