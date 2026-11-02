import { useState } from 'react';
import { useLanguage } from '../i18n/LanguageContext';
import { clearSessionCredentials } from '../sessionCredentials';

export default function SignOutEverywhere({ apiUrl }) {
  const { t } = useLanguage();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  async function signOut() {
    if (!window.confirm(t('auth.logoutAllConfirm'))) return;
    setBusy(true); setError(false);
    try {
      const response = await fetch(`${apiUrl}/api/auth/logout-all`, { method: 'POST' });
      if (!response.ok) throw new Error('Logout failed');
      await clearSessionCredentials();
      for (const key of ['user_number', 'user_name', 'must_change_password']) localStorage.removeItem(key);
      window.location.assign('/');
    } catch { setError(true); setBusy(false); }
  }
  return <div className="mt-5 rounded-lg border border-slate-200 bg-white p-4">
    <h3 className="font-semibold">{t('auth.devicesTitle')}</h3>
    <p className="my-3 text-sm text-slate-600">{t('auth.devicesDescription')}</p>
    {error && <p role="alert" className="mb-3 text-sm text-rose-700">{t('auth.logoutFailed')}</p>}
    <button type="button" disabled={busy} onClick={signOut} className="rounded bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50">
      {t('auth.logoutAll')}
    </button>
  </div>;
}
