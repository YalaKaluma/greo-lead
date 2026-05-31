import en from './en.json';
import fr from './fr.json';

export const DEFAULT_LANGUAGE = 'en';
export const SUPPORTED_LANGUAGES = ['en', 'fr'];

export const resources = { en, fr };

export function normalizeLanguage(language) {
  return SUPPORTED_LANGUAGES.includes(language) ? language : DEFAULT_LANGUAGE;
}

export function translate(language, key, fallback = '') {
  const normalized = normalizeLanguage(language);
  return resources[normalized]?.[key] ?? resources[DEFAULT_LANGUAGE]?.[key] ?? fallback ?? key;
}
