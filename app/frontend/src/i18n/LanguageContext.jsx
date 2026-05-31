import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { DEFAULT_LANGUAGE, normalizeLanguage, translate } from './index';

const storageKeyFor = (userNumber) => (
  userNumber ? `alfred_language_preference:${userNumber}` : 'alfred_language_preference'
);

const LanguageContext = createContext({
  language: DEFAULT_LANGUAGE,
  setLanguage: () => {},
  t: (key) => key,
  isSavingLanguage: false,
  saveError: null
});

export function LanguageProvider({ apiUrl, userNumber, children }) {
  const [language, setLanguageState] = useState(() => (
    normalizeLanguage(localStorage.getItem(storageKeyFor(userNumber)) || DEFAULT_LANGUAGE)
  ));
  const [isSavingLanguage, setIsSavingLanguage] = useState(false);
  const [saveError, setSaveError] = useState(null);

  useEffect(() => {
    document.documentElement.lang = language;
    localStorage.setItem(storageKeyFor(userNumber), language);
  }, [language, userNumber]);

  useEffect(() => {
    if (!userNumber) return;

    let cancelled = false;
    setLanguageState(normalizeLanguage(localStorage.getItem(storageKeyFor(userNumber)) || DEFAULT_LANGUAGE));
    const loadSettings = async () => {
      try {
        const response = await axios.get(`${apiUrl}/api/settings`, {
          params: { user_number: userNumber }
        });
        const backendLanguage = normalizeLanguage(response.data?.language_preference);
        if (!cancelled) setLanguageState(backendLanguage);
      } catch (error) {
        if (!cancelled) {
          console.warn('Using local language preference because settings could not be loaded.', error);
        }
      }
    };

    loadSettings();
    return () => {
      cancelled = true;
    };
  }, [apiUrl, userNumber]);

  const setLanguage = async (nextLanguage) => {
    const normalized = normalizeLanguage(nextLanguage);
    setLanguageState(normalized);
    setSaveError(null);

    if (!userNumber) return;

    setIsSavingLanguage(true);
    try {
      await axios.put(`${apiUrl}/api/settings/language`, {
        user_number: userNumber,
        language_preference: normalized
      });
    } catch (error) {
      console.warn('Language preference saved locally only.', error);
      setSaveError('settings.saveError');
    } finally {
      setIsSavingLanguage(false);
    }
  };

  const value = useMemo(() => ({
    language,
    setLanguage,
    isSavingLanguage,
    saveError,
    t: (key, fallback) => translate(language, key, fallback)
  }), [language, isSavingLanguage, saveError]);

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
