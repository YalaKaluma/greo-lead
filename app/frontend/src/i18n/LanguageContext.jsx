import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { DEFAULT_LANGUAGE, normalizeLanguage, translate } from './index';
import { normalizeTimezone } from '../utils/taskHelpers';

export const DEFAULT_TIMEZONE = 'America/New_York';

const storageKeyFor = (userNumber) => (
  userNumber ? `alfred_language_preference:${userNumber}` : 'alfred_language_preference'
);

const timezoneStorageKeyFor = (userNumber) => (
  userNumber ? `alfred_timezone_preference:${userNumber}` : 'alfred_timezone_preference'
);

const LanguageContext = createContext({
  language: DEFAULT_LANGUAGE,
  setLanguage: () => {},
  timezone: DEFAULT_TIMEZONE,
  setTimezone: () => {},
  t: (key) => key,
  isSavingLanguage: false,
  isSavingTimezone: false,
  saveError: null
});

export function LanguageProvider({ apiUrl, userNumber, children }) {
  const [language, setLanguageState] = useState(() => (
    normalizeLanguage(localStorage.getItem(storageKeyFor(userNumber)) || DEFAULT_LANGUAGE)
  ));
  const [timezone, setTimezoneState] = useState(() => (
    normalizeTimezone(localStorage.getItem(timezoneStorageKeyFor(userNumber)) || DEFAULT_TIMEZONE)
  ));
  const [isSavingLanguage, setIsSavingLanguage] = useState(false);
  const [isSavingTimezone, setIsSavingTimezone] = useState(false);
  const [saveError, setSaveError] = useState(null);

  useEffect(() => {
    document.documentElement.lang = language;
    localStorage.setItem(storageKeyFor(userNumber), language);
  }, [language, userNumber]);

  useEffect(() => {
    localStorage.setItem(timezoneStorageKeyFor(userNumber), timezone);
  }, [timezone, userNumber]);

  useEffect(() => {
    if (!userNumber) return;

    let cancelled = false;
    setLanguageState(normalizeLanguage(localStorage.getItem(storageKeyFor(userNumber)) || DEFAULT_LANGUAGE));
    setTimezoneState(normalizeTimezone(localStorage.getItem(timezoneStorageKeyFor(userNumber)) || DEFAULT_TIMEZONE));
    const loadSettings = async () => {
      try {
        const response = await axios.get(`${apiUrl}/api/settings`, {
          params: { user_number: userNumber }
        });
        const backendLanguage = normalizeLanguage(response.data?.language_preference);
        const backendTimezone = normalizeTimezone(response.data?.timezone_preference || DEFAULT_TIMEZONE);
        if (!cancelled) {
          setLanguageState(backendLanguage);
          setTimezoneState(backendTimezone);
        }
      } catch (error) {
        if (!cancelled) {
          console.warn('Using local settings because backend settings could not be loaded.', error);
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

  const setTimezone = async (nextTimezone) => {
    const normalized = normalizeTimezone(nextTimezone || DEFAULT_TIMEZONE);
    setTimezoneState(normalized);
    setSaveError(null);

    if (!userNumber) return;

    setIsSavingTimezone(true);
    try {
      await axios.put(`${apiUrl}/api/settings/timezone`, {
        user_number: userNumber,
        timezone_preference: normalized
      });
    } catch (error) {
      console.warn('Timezone preference saved locally only.', error);
      setSaveError('settings.saveError');
    } finally {
      setIsSavingTimezone(false);
    }
  };

  const value = useMemo(() => ({
    language,
    setLanguage,
    timezone,
    setTimezone,
    isSavingLanguage,
    isSavingTimezone,
    saveError,
    t: (key, fallback) => translate(language, key, fallback)
  }), [language, timezone, isSavingLanguage, isSavingTimezone, saveError]);

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
