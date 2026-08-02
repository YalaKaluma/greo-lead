import React, { useMemo, useState } from 'react';
import { useLanguage } from '../i18n/LanguageContext';

const TRUST_INDICATORS = [
  ['encryption', 'trustSecurity.indicators.encryption.label', 'trustSecurity.indicators.encryption.value'],
  ['authentication', 'trustSecurity.indicators.authentication.label', 'trustSecurity.indicators.authentication.value'],
  ['ai', 'trustSecurity.indicators.ai.label', 'trustSecurity.indicators.ai.value'],
  ['gdpr', 'trustSecurity.indicators.gdpr.label', 'trustSecurity.indicators.gdpr.value'],
  ['monitoring', 'trustSecurity.indicators.monitoring.label', 'trustSecurity.indicators.monitoring.value']
];

const TABS = [
  {
    id: 'privacy',
    labelKey: 'trustSecurity.tabs.privacy.label',
    titleKey: 'trustSecurity.tabs.privacy.title',
    sections: [
      {
        headingKey: 'trustSecurity.privacy.overview.heading',
        paragraphs: [
          'trustSecurity.privacy.overview.p1',
          'trustSecurity.privacy.overview.p2',
          'trustSecurity.privacy.overview.p3'
        ]
      },
      {
        headingKey: 'trustSecurity.privacy.collect.heading',
        paragraphs: ['trustSecurity.privacy.collect.intro'],
        bullets: [
          'trustSecurity.privacy.collect.b1',
          'trustSecurity.privacy.collect.b2',
          'trustSecurity.privacy.collect.b3',
          'trustSecurity.privacy.collect.b4',
          'trustSecurity.privacy.collect.b5',
          'trustSecurity.privacy.collect.b6'
        ]
      },
      {
        headingKey: 'trustSecurity.privacy.use.heading',
        paragraphs: ['trustSecurity.privacy.use.intro'],
        bullets: [
          'trustSecurity.privacy.use.b1',
          'trustSecurity.privacy.use.b2',
          'trustSecurity.privacy.use.b3',
          'trustSecurity.privacy.use.b4',
          'trustSecurity.privacy.use.b5',
          'trustSecurity.privacy.use.b6'
        ]
      },
      {
        headingKey: 'trustSecurity.privacy.ai.heading',
        paragraphs: [
          'trustSecurity.privacy.ai.p1',
          'trustSecurity.privacy.ai.p2',
          'trustSecurity.privacy.ai.p3'
        ]
      },
      {
        headingKey: 'trustSecurity.privacy.storage.heading',
        paragraphs: [
          'trustSecurity.privacy.storage.p1',
          'trustSecurity.privacy.storage.p2'
        ]
      },
      {
        headingKey: 'trustSecurity.privacy.children.heading',
        paragraphs: [
          'trustSecurity.privacy.children.p1',
          'trustSecurity.privacy.children.p2'
        ]
      },
      {
        headingKey: 'trustSecurity.privacy.rights.heading',
        paragraphs: ['trustSecurity.privacy.rights.intro'],
        bullets: [
          'trustSecurity.privacy.rights.b1',
          'trustSecurity.privacy.rights.b2',
          'trustSecurity.privacy.rights.b3',
          'trustSecurity.privacy.rights.b4',
          'trustSecurity.privacy.rights.b5'
        ]
      },
      {
        headingKey: 'trustSecurity.shared.contact.heading',
        paragraphs: ['trustSecurity.privacy.contact.p1'],
        contactKey: 'trustSecurity.contact.privacy'
      }
    ]
  },
  {
    id: 'terms',
    labelKey: 'trustSecurity.tabs.terms.label',
    titleKey: 'trustSecurity.tabs.terms.title',
    sections: [
      { headingKey: 'trustSecurity.terms.acceptance.heading', paragraphs: ['trustSecurity.terms.acceptance.p1'] },
      { headingKey: 'trustSecurity.terms.eligibility.heading', paragraphs: ['trustSecurity.terms.eligibility.p1', 'trustSecurity.terms.eligibility.p2'] },
      { headingKey: 'trustSecurity.terms.intended.heading', paragraphs: ['trustSecurity.terms.intended.p1', 'trustSecurity.terms.intended.p2'] },
      {
        headingKey: 'trustSecurity.terms.responsibilities.heading',
        paragraphs: ['trustSecurity.terms.responsibilities.intro'],
        bullets: [
          'trustSecurity.terms.responsibilities.b1',
          'trustSecurity.terms.responsibilities.b2',
          'trustSecurity.terms.responsibilities.b3',
          'trustSecurity.terms.responsibilities.b4',
          'trustSecurity.terms.responsibilities.b5'
        ]
      },
      { headingKey: 'trustSecurity.terms.availability.heading', paragraphs: ['trustSecurity.terms.availability.p1', 'trustSecurity.terms.availability.p2'] },
      { headingKey: 'trustSecurity.terms.ai.heading', paragraphs: ['trustSecurity.terms.ai.p1', 'trustSecurity.terms.ai.p2'] },
      { headingKey: 'trustSecurity.terms.ip.heading', paragraphs: ['trustSecurity.terms.ip.p1'] },
      { headingKey: 'trustSecurity.terms.userContent.heading', paragraphs: ['trustSecurity.terms.userContent.p1', 'trustSecurity.terms.userContent.p2'] },
      { headingKey: 'trustSecurity.terms.termination.heading', paragraphs: ['trustSecurity.terms.termination.p1', 'trustSecurity.terms.termination.p2'] }
    ]
  },
  {
    id: 'security',
    labelKey: 'trustSecurity.tabs.security.label',
    titleKey: 'trustSecurity.tabs.security.title',
    sections: [
      { headingKey: 'trustSecurity.security.principles.heading', paragraphs: ['trustSecurity.security.principles.p1', 'trustSecurity.security.principles.p2'] },
      { headingKey: 'trustSecurity.security.infrastructure.heading', paragraphs: ['trustSecurity.security.infrastructure.p1', 'trustSecurity.security.infrastructure.p2'] },
      { headingKey: 'trustSecurity.security.authentication.heading', paragraphs: ['trustSecurity.security.authentication.p1', 'trustSecurity.security.authentication.p2'] },
      { headingKey: 'trustSecurity.security.monitoring.heading', paragraphs: ['trustSecurity.security.monitoring.p1', 'trustSecurity.security.monitoring.p2'] },
      { headingKey: 'trustSecurity.security.ai.heading', paragraphs: ['trustSecurity.security.ai.p1'] },
      { headingKey: 'trustSecurity.security.access.heading', paragraphs: ['trustSecurity.security.access.p1'] },
      { headingKey: 'trustSecurity.security.improvements.heading', paragraphs: ['trustSecurity.security.improvements.p1'] },
      {
        headingKey: 'trustSecurity.security.disclosure.heading',
        paragraphs: ['trustSecurity.security.disclosure.p1'],
        contactKey: 'trustSecurity.contact.security'
      }
    ]
  },
  {
    id: 'gdpr',
    labelKey: 'trustSecurity.tabs.gdpr.label',
    titleKey: 'trustSecurity.tabs.gdpr.title',
    sections: [
      { headingKey: 'trustSecurity.gdpr.commitment.heading', paragraphs: ['trustSecurity.gdpr.commitment.p1', 'trustSecurity.gdpr.commitment.p2'] },
      { headingKey: 'trustSecurity.gdpr.controller.heading', paragraphs: ['trustSecurity.gdpr.controller.p1'] },
      { headingKey: 'trustSecurity.gdpr.processor.heading', paragraphs: ['trustSecurity.gdpr.processor.p1', 'trustSecurity.gdpr.processor.p2'] },
      {
        headingKey: 'trustSecurity.gdpr.rights.heading',
        paragraphs: ['trustSecurity.gdpr.rights.intro'],
        bullets: [
          'trustSecurity.gdpr.rights.b1',
          'trustSecurity.gdpr.rights.b2',
          'trustSecurity.gdpr.rights.b3',
          'trustSecurity.gdpr.rights.b4',
          'trustSecurity.gdpr.rights.b5'
        ]
      },
      {
        id: 'accountDeletion',
        headingKey: 'trustSecurity.gdpr.deletion.heading',
        paragraphs: [
          'trustSecurity.gdpr.deletion.p1',
          'trustSecurity.gdpr.deletion.p2',
          'trustSecurity.gdpr.deletion.p3'
        ],
        bullets: [
          'trustSecurity.gdpr.deletion.b1',
          'trustSecurity.gdpr.deletion.b2',
          'trustSecurity.gdpr.deletion.b3'
        ],
        contactKey: 'trustSecurity.contact.privacy',
        contactLabelKey: 'trustSecurity.gdpr.deletion.emailLabel'
      },
      { headingKey: 'trustSecurity.gdpr.retention.heading', paragraphs: ['trustSecurity.gdpr.retention.p1', 'trustSecurity.gdpr.retention.p2'] },
      { headingKey: 'trustSecurity.gdpr.transfers.heading', paragraphs: ['trustSecurity.gdpr.transfers.p1'] },
      {
        headingKey: 'trustSecurity.shared.contact.heading',
        paragraphs: ['trustSecurity.gdpr.contact.p1'],
        contactKey: 'trustSecurity.contact.privacy'
      }
    ]
  },
  {
    id: 'support',
    labelKey: 'trustSecurity.tabs.support.label',
    titleKey: 'trustSecurity.tabs.support.title',
    sections: [
      {
        headingKey: 'trustSecurity.support.help.heading',
        paragraphs: ['trustSecurity.support.help.p1'],
        contactKey: 'trustSecurity.contact.support'
      },
      {
        headingKey: 'trustSecurity.support.details.heading',
        paragraphs: ['trustSecurity.support.details.p1'],
        bullets: [
          'trustSecurity.support.details.b1',
          'trustSecurity.support.details.b2',
          'trustSecurity.support.details.b3',
          'trustSecurity.support.details.b4'
        ]
      },
      {
        headingKey: 'trustSecurity.support.privacy.heading',
        paragraphs: ['trustSecurity.support.privacy.p1'],
        contactKey: 'trustSecurity.contact.privacy'
      }
    ]
  },
  {
    id: 'cookies',
    labelKey: 'trustSecurity.tabs.cookies.label',
    titleKey: 'trustSecurity.tabs.cookies.title',
    sections: [
      { headingKey: 'trustSecurity.cookies.overview.heading', paragraphs: ['trustSecurity.cookies.overview.p1'] },
      {
        headingKey: 'trustSecurity.cookies.why.heading',
        paragraphs: ['trustSecurity.cookies.why.intro'],
        bullets: [
          'trustSecurity.cookies.why.b1',
          'trustSecurity.cookies.why.b2',
          'trustSecurity.cookies.why.b3',
          'trustSecurity.cookies.why.b4',
          'trustSecurity.cookies.why.b5'
        ]
      },
      { headingKey: 'trustSecurity.cookies.essential.heading', paragraphs: ['trustSecurity.cookies.essential.p1', 'trustSecurity.cookies.essential.p2'] },
      { headingKey: 'trustSecurity.cookies.analytics.heading', paragraphs: ['trustSecurity.cookies.analytics.p1', 'trustSecurity.cookies.analytics.p2'] },
      { headingKey: 'trustSecurity.cookies.managing.heading', paragraphs: ['trustSecurity.cookies.managing.p1', 'trustSecurity.cookies.managing.p2'] },
      {
        headingKey: 'trustSecurity.shared.contact.heading',
        paragraphs: ['trustSecurity.cookies.contact.p1'],
        contactKey: 'trustSecurity.contact.privacy'
      }
    ]
  }
];

export default function TrustSecurity({ onBack, publicView = false, initialTab = TABS[0].id, focusSection }) {
  const { language, setLanguage, t } = useLanguage();
  const [activeTab, setActiveTab] = useState(
    TABS.some((tab) => tab.id === initialTab) ? initialTab : TABS[0].id
  );
  const currentTab = useMemo(
    () => TABS.find((tab) => tab.id === activeTab) || TABS[0],
    [activeTab]
  );

  return (
    <div className="min-h-full bg-white">
      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="text-sm font-medium text-slate-600 hover:text-slate-900"
            >
              {t('settings.back')}
            </button>
          ) : <span />}

          {publicView && (
            <div className="flex rounded-md border border-slate-200 bg-white p-1 text-sm">
              {['en', 'fr'].map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setLanguage(option)}
                  className={`rounded px-3 py-1.5 font-semibold transition-colors ${
                    language === option
                      ? 'bg-slate-950 text-white'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950'
                  }`}
                >
                  {t(`trustSecurity.language.${option}`)}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="border-b border-slate-200 pb-6">
          <h1 className="text-3xl font-bold text-slate-900">{t('trustSecurity.title')}</h1>
          <p className="mt-2 text-slate-600">{t('trustSecurity.subtitle')}</p>
        </div>

        <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5" aria-label={t('trustSecurity.indicatorsLabel')}>
          {TRUST_INDICATORS.map(([id, labelKey, valueKey]) => (
            <div key={id} className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t(labelKey)}</p>
              <p className="mt-2 inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-sm font-semibold text-emerald-700">
                {t(valueKey)}
              </p>
            </div>
          ))}
        </section>

        <div className="mt-6 flex flex-wrap gap-2 border-b border-slate-200">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`border-b-2 px-4 py-3 text-sm font-semibold transition-colors ${
                activeTab === tab.id
                  ? 'border-slate-950 text-slate-950'
                  : 'border-transparent text-slate-500 hover:text-slate-900'
              }`}
            >
              {t(tab.labelKey)}
            </button>
          ))}
        </div>

        <article className="max-w-3xl py-8">
          <h2 className="text-2xl font-bold text-slate-900">{t(currentTab.titleKey)}</h2>
          <div className="mt-6 space-y-8">
            {currentTab.sections.map((section) => (
              <PolicySection
                key={section.headingKey}
                section={section}
                t={t}
                highlighted={section.id && section.id === focusSection}
              />
            ))}
          </div>
        </article>
      </div>
    </div>
  );
}

function PolicySection({ section, t, highlighted = false }) {
  return (
    <section
      id={section.id}
      className={`border-t pt-6 first:border-t-0 first:pt-0 ${
        highlighted
          ? 'rounded-lg border border-blue-200 bg-blue-50/60 p-5 first:p-5'
          : 'border-slate-100'
      }`}
    >
      <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
        {t(section.headingKey)}
      </h3>
      <div className="mt-3 space-y-3 text-sm leading-6 text-slate-700 sm:text-base sm:leading-7">
        {(section.paragraphs || []).map((key) => (
          <p key={key}>{t(key)}</p>
        ))}
        {section.bullets?.length > 0 && (
          <ul className="list-disc space-y-2 pl-5">
            {section.bullets.map((key) => (
              <li key={key}>{t(key)}</li>
            ))}
          </ul>
        )}
        {section.contactKey && (
          <p>
            <a className="font-semibold text-slate-950 underline decoration-slate-300 underline-offset-4 hover:decoration-slate-950" href={`mailto:${t(section.contactKey)}`}>
              {section.contactLabelKey ? t(section.contactLabelKey) : t(section.contactKey)}
            </a>
          </p>
        )}
      </div>
    </section>
  );
}
