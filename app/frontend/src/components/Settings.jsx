import React, { useState } from 'react';
import axios from 'axios';
import { useLanguage } from '../i18n/LanguageContext';

const TIMEZONE_OPTIONS = [
  { value: 'America/New_York', label: 'Eastern Time - New York' },
  { value: 'America/Chicago', label: 'Central Time - Chicago' },
  { value: 'America/Denver', label: 'Mountain Time - Denver' },
  { value: 'America/Los_Angeles', label: 'Pacific Time - Los Angeles' },
  { value: 'America/Toronto', label: 'Toronto' },
  { value: 'Europe/London', label: 'London' },
  { value: 'Europe/Paris', label: 'Paris' },
  { value: 'Europe/Brussels', label: 'Brussels' },
  { value: 'Europe/Zurich', label: 'Zurich' },
  { value: 'Asia/Dubai', label: 'Dubai' },
  { value: 'Asia/Singapore', label: 'Singapore' },
  { value: 'Asia/Tokyo', label: 'Tokyo' },
  { value: 'Australia/Sydney', label: 'Sydney' }
];

export default function Settings({ apiUrl, userNumber, onBack }) {
  const {
    language,
    setLanguage,
    timezone,
    setTimezone,
    t,
    isSavingLanguage,
    isSavingTimezone,
    saveError
  } = useLanguage();
  const [isBackfillingDepth, setIsBackfillingDepth] = useState(false);
  const [backfillResult, setBackfillResult] = useState(null);
  const [backfillError, setBackfillError] = useState(null);

  const runReflectionDepthBackfill = async () => {
    if (!userNumber || isBackfillingDepth) return;

    const confirmed = window.confirm(
      'Alfred will send your last 200 user messages to OpenAI to score Reflection Depth. Continue?'
    );
    if (!confirmed) return;

    setIsBackfillingDepth(true);
    setBackfillResult(null);
    setBackfillError(null);

    try {
      const response = await axios.post(`${apiUrl}/api/settings/journal/reflection-depth-backfill`, {
        user_number: userNumber,
        limit: 200
      });
      setBackfillResult(response.data);
    } catch (error) {
      console.error('Reflection depth backfill failed:', error);
      setBackfillError(error.response?.data?.detail || 'Alfred could not score the recent journal messages yet.');
    } finally {
      setIsBackfillingDepth(false);
    }
  };

  return (
    <div className="min-h-full bg-white">
      <div className="mx-auto max-w-3xl px-6 py-8">
        <button
          type="button"
          onClick={onBack}
          className="mb-6 text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          {t('settings.back')}
        </button>

        <div className="border-b border-slate-200 pb-6">
          <h1 className="text-3xl font-bold text-slate-900">{t('settings.title')}</h1>
          <p className="mt-2 text-slate-600">{t('settings.subtitle')}</p>
        </div>

        <section className="py-8">
          <div className="max-w-xl">
            <label className="block text-sm font-semibold text-slate-900">
              {t('settings.languageLabel')}
            </label>
            <p className="mt-1 text-sm text-slate-500">{t('settings.languageHelp')}</p>

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {[
                { value: 'en', label: t('settings.english') },
                { value: 'fr', label: t('settings.french') }
              ].map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setLanguage(option.value)}
                  className={`rounded-lg border px-4 py-4 text-left transition-colors ${
                    language === option.value
                      ? 'border-blue-600 bg-blue-50 text-blue-900'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                  }`}
                >
                  <span className="block text-base font-semibold">{option.label}</span>
                  <span className="mt-1 block text-sm text-slate-500">
                    {language === option.value ? t('settings.current') : ''}
                  </span>
                </button>
              ))}
            </div>

            {isSavingLanguage && (
              <p className="mt-4 text-sm text-slate-500">{t('settings.saved')}</p>
            )}
            {saveError && (
              <p className="mt-4 text-sm text-amber-700">{t(saveError)}</p>
            )}
          </div>
        </section>

        <section className="border-t border-slate-200 py-8">
          <div className="max-w-xl">
            <label className="block text-sm font-semibold text-slate-900" htmlFor="timezone-preference">
              {t('settings.timezoneLabel')}
            </label>
            <p className="mt-1 text-sm text-slate-500">{t('settings.timezoneHelp')}</p>

            <select
              id="timezone-preference"
              value={timezone}
              onChange={(event) => setTimezone(event.target.value)}
              className="mt-4 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
            >
              {TIMEZONE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            <p className="mt-3 text-sm text-slate-500">
              {t('settings.currentTimezone')}: {timezone}
            </p>
            {isSavingTimezone && (
              <p className="mt-4 text-sm text-slate-500">{t('settings.timezoneSaved')}</p>
            )}
          </div>
        </section>

        <section className="border-t border-slate-200 py-8">
          <div className="max-w-xl">
            <h2 className="text-sm font-semibold text-slate-900">
              Journal Reflection Depth
            </h2>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              Score your last 200 journal/user messages so the Trends tab has more history to work with.
            </p>

            <button
              type="button"
              onClick={runReflectionDepthBackfill}
              disabled={isBackfillingDepth || !userNumber}
              className="mt-4 rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {isBackfillingDepth ? 'Scoring recent messages...' : 'Score last 200 messages'}
            </button>

            {backfillResult && (
              <p className="mt-4 text-sm text-emerald-700">
                Scored {backfillResult.scored} message{backfillResult.scored === 1 ? '' : 's'}.
                {backfillResult.skipped_already_scored > 0
                  ? ` ${backfillResult.skipped_already_scored} already had scores.`
                  : ''}
              </p>
            )}
            {backfillError && (
              <p className="mt-4 text-sm text-rose-700">
                {backfillError}
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
