import en from './en';
import es from './es';
import fr from './fr';
import de from './de';
import pt from './pt';
import ja from './ja';
import zh from './zh';

export type TranslationKeys = typeof en;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const translations: Record<string, any> = {
  en,
  es,
  fr,
  de,
  pt,
  ja,
  zh,
};

export const availableLanguages = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Español' },
  { code: 'fr', name: 'Français' },
  { code: 'de', name: 'Deutsch' },
  { code: 'pt', name: 'Português' },
  { code: 'ja', name: '日本語' },
  { code: 'zh', name: '中文' },
];
