import React, { useCallback, useEffect, useState } from 'react';
import { useLanguage } from '../i18n/LanguageContext';
import { clearSessionCredentials } from '../sessionCredentials';

export default function Sidebar({ apiUrl, userNumber, currentPage, onNavigate, isOpen, isMobile, onClose }) {

  const { t } = useLanguage();
  const [counts, setCounts] = useState({ tasks: 0, habits: 0, meetings: 0, journal: 0 });
  const [isAboutOpen, setIsAboutOpen] = useState(
    currentPage === 'alfred-story' || currentPage === 'trust-security'
  );

  const loadCounts = useCallback(() => {
    if (!userNumber) return;
    fetch(`${apiUrl}/api/home/sidebar-counts?user_number=${encodeURIComponent(userNumber)}`)
      .then((response) => response.ok ? response.json() : null)
      .then((data) => data && setCounts({
        tasks: Number(data.tasks) || 0,
        habits: Number(data.habits) || 0,
        meetings: Number(data.meetings) || 0,
        journal: Number(data.journal) || 0,
      }))
      .catch(() => {
        // Navigation remains usable if the optional counts cannot be loaded.
      });
  }, [apiUrl, userNumber]);

  useEffect(() => {
    loadCounts();
    const interval = window.setInterval(loadCounts, 30000);
    window.addEventListener('focus', loadCounts);
    window.addEventListener('alfred-sidebar-counts-refresh', loadCounts);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', loadCounts);
      window.removeEventListener('alfred-sidebar-counts-refresh', loadCounts);
    };
  }, [loadCounts, currentPage]);

  const menuItems = [
    { id: 'home', label: t('nav.home'), disabled: false },
    { id: 'my-goals', label: t('nav.goals'), disabled: false },
    { id: 'projects', label: t('nav.projects'), disabled: false },
    { id: 'todo-list', label: t('nav.tasks'), disabled: false, count: counts.tasks },
    { id: 'my-journey', label: t('nav.journey'), disabled: false },
    { id: 'my-habits', label: t('nav.habits'), disabled: false, count: counts.habits },
    { id: 'my-team', label: t('nav.team'), disabled: false },
    { id: 'meetings', label: t('nav.meetings'), disabled: false, count: counts.meetings },
//    { id: 'coaching-sessions', label: t('nav.coaching'), disabled: false },
    { id: 'my-journal', label: t('nav.journal'), disabled: false, count: counts.journal },
    // { id: 'my-feedback', label: t('nav.feedback'), disabled: true },
//    { id: 'my-calendar', label: t('nav.calendar'), disabled: true },
  ];

  return (
    <aside
      className={`
        ${isMobile ? 'fixed' : 'relative'}
        top-0 left-0 h-full
        bg-slate-900 text-white
        transition-transform duration-300 ease-in-out
        ${isMobile && !isOpen ? '-translate-x-full' : 'translate-x-0'}
        ${isMobile ? 'z-40' : 'z-10'}
        w-80
      `}
      style={{
        width: '320px',
        paddingTop: isMobile ? 'var(--alfred-safe-area-top)' : undefined,
        paddingBottom: isMobile ? 'var(--alfred-safe-area-bottom)' : undefined,
      }}
    >
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className={`${isMobile ? 'p-4' : 'p-6'} border-b border-slate-800`}>
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-lg font-bold leading-tight text-white">
                {t('app.title')}
              </h1>
              <p className="text-sm text-slate-400 mt-1 ml-2">
                {t('app.poweredBy')}
              </p>
            </div>
            {isMobile && (
              <button
                onClick={onClose}
                className="p-1 hover:bg-slate-800 rounded ml-2"
                aria-label="Close menu"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Navigation Menu */}
        <nav className={`min-h-0 flex-1 overflow-y-auto ${isMobile ? 'p-3' : 'p-4'}`}>
          <div className="space-y-1">
            {menuItems.map((item) => (
              <button
                key={item.id}
                onClick={() => !item.disabled && onNavigate(item.id)}
                disabled={item.disabled}
                className={`
                  w-full text-left px-4 ${isMobile ? 'py-2.5' : 'py-3'} rounded-lg
                  transition-all duration-200
                  ${
                    item.disabled
                      ? 'text-slate-500 opacity-60 cursor-not-allowed'
                      : currentPage === item.id
                        ? 'bg-slate-800 text-white shadow-md'
                        : 'text-slate-200 hover:bg-slate-800 hover:text-white'
                  }
                `}
              >
                
                
                <div className="flex items-center justify-between w-full">
                  <span>{item.label}</span>
                  {item.count > 0 && (
                    <span className="ml-3 min-w-6 rounded-full bg-blue-500 px-2 py-0.5 text-center text-xs font-semibold leading-5 text-white" aria-label={`${item.count} remaining`}>
                      {item.count > 99 ? '99+' : item.count}
                    </span>
                  )}
                </div>

              </button>
            ))}

            <div className="my-3 border-t border-slate-800" />

            <button
              type="button"
              onClick={() => setIsAboutOpen((open) => !open)}
              className={`flex w-full items-center justify-between rounded-lg px-4 ${isMobile ? 'py-2.5' : 'py-3'} text-left text-slate-300 transition-all duration-200 hover:bg-slate-800 hover:text-white`}
              aria-expanded={isAboutOpen}
              aria-controls="alfred-about-navigation"
            >
              <span>{t('nav.aboutAlfred')}</span>
              <svg
                className={`h-4 w-4 transition-transform duration-200 ${isAboutOpen ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {isAboutOpen && (
              <div id="alfred-about-navigation" className="space-y-1 pl-3">
                <button
                  onClick={() => onNavigate('alfred-story')}
                  className={`w-full rounded-lg px-4 py-2.5 text-left transition-all duration-200 ${
                    currentPage === 'alfred-story'
                      ? 'bg-slate-800 text-white shadow-md'
                      : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  {t('nav.story')}
                </button>
                <button
                  onClick={() => onNavigate('trust-security')}
                  className={`w-full rounded-lg px-4 py-2.5 text-left transition-all duration-200 ${
                    currentPage === 'trust-security'
                      ? 'bg-slate-800 text-white shadow-md'
                      : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  {t('nav.trustSecurity')}
                </button>
              </div>
            )}

            <button
              onClick={() => onNavigate('settings')}
              className={`w-full rounded-lg px-4 ${isMobile ? 'py-2.5' : 'py-3'} text-left transition-all duration-200 ${
                currentPage === 'settings'
                  ? 'bg-slate-800 text-white shadow-md'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              {t('nav.settings')}
            </button>
          </div>
        </nav>

        {/* Logout stays visible while leaving room for the Alfred launcher. */}
        <div className="shrink-0 border-t border-slate-800 p-4 pr-24">
          <button
            onClick={async () => {
              await fetch(`${apiUrl}/api/auth/logout`, { method: 'POST' }).catch(() => null);
              clearSessionCredentials();
              localStorage.removeItem('user_number');
              window.location.reload();
            }}
            className="w-full rounded-lg px-4 py-3 text-left text-slate-400 transition-all duration-200 hover:bg-slate-800 hover:text-white"
          >
            {t('nav.logout')}
          </button>
        </div>
      </div>
    </aside>
  );
}
