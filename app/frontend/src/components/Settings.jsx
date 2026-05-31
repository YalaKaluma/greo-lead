import React from 'react';
import { useLanguage } from '../i18n/LanguageContext';

export default function Settings({ onBack }) {
  const { language, setLanguage, t, isSavingLanguage, saveError } = useLanguage();

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
      </div>
    </div>
  );
}
