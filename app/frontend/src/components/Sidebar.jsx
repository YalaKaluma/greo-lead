import React, { useCallback, useEffect, useState } from 'react';
import { useLanguage } from '../i18n/LanguageContext';

export default function Sidebar({ apiUrl, userNumber, currentPage, onNavigate, isOpen, isMobile, onClose }) {

  const { t } = useLanguage();
  const [counts, setCounts] = useState({ tasks: 0, habits: 0, meetings: 0, journal: 0 });

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
      style={{ width: '320px' }}
    >
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="p-6 border-b border-slate-800">
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
        <nav className="flex-1 overflow-y-auto p-4">
          <div className="space-y-1">
            {menuItems.map((item) => (
              <button
                key={item.id}
                onClick={() => !item.disabled && onNavigate(item.id)}
                disabled={item.disabled}
                className={`
                  w-full text-left px-4 py-3 rounded-lg
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
          </div>
        </nav>

        {/* Footer controls */}
        <div className="flex items-end justify-between gap-4 p-4 border-t border-slate-800">
          <div className="flex w-36 flex-col gap-2">
            <button
              onClick={() => onNavigate('alfred-story')}
              className={`px-3 py-3 text-left rounded-lg transition-all duration-200 ${
                currentPage === 'alfred-story'
                  ? 'bg-slate-800 text-white shadow-md'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              {t('nav.story')}
            </button>
            <button
              onClick={() => onNavigate('trust-security')}
              className={`px-3 py-3 text-left rounded-lg transition-all duration-200 ${
                currentPage === 'trust-security'
                  ? 'bg-slate-800 text-white shadow-md'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              {t('nav.trustSecurity')}
            </button>
            <button
              onClick={() => onNavigate('settings')}
              className={`px-3 py-3 text-left rounded-lg transition-all duration-200 ${
                currentPage === 'settings'
                  ? 'bg-slate-800 text-white shadow-md'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              {t('nav.settings')}
            </button>
            <button
              onClick={() => {
                localStorage.removeItem('user_number');
                window.location.reload();
              }}
              className="px-3 py-3 text-left text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-all duration-200"
            >
              {t('nav.logout')}
            </button>
          </div>
          <div className="h-16 w-16 shrink-0" aria-hidden="true" />
        </div>
      </div>
    </aside>
  );
}
