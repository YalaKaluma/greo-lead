import { useEffect, useState } from 'react';
import { useLanguage } from '../i18n/LanguageContext';
import { storeSessionResponse } from '../sessionCredentials';

export default function AdminSessionGate({ apiUrl, children }) {
  const { t } = useLanguage();
  const [state, setState] = useState('checking');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setState('checking');
    fetch(`${apiUrl}/api/auth/admin-session`).then(async response => {
      const data = await response.json();
      if (cancelled) return;
      if (response.ok) setState('ready');
      else if (data?.detail?.code === 'admin_reauthentication_required') setState('locked');
      else setState('error');
    }).catch(() => { if (!cancelled) setState('error'); });
    const lock = () => { setPassword(''); setError(''); setState('locked'); };
    window.addEventListener('alfred-admin-reauthentication', lock);
    return () => { cancelled = true; window.removeEventListener('alfred-admin-reauthentication', lock); };
  }, [apiUrl, attempt]);

  async function unlock(event) {
    event.preventDefault();
    setBusy(true); setError('');
    try {
      const response = await fetch(`${apiUrl}/api/auth/reauthenticate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (!response.ok) throw new Error('Reauthentication failed');
      await storeSessionResponse(await response.json());
      setPassword(''); setState('ready');
    } catch { setError(t('auth.adminUnlockFailed')); }
    finally { setBusy(false); }
  }
  if (state === 'ready') return children;
  if (state === 'checking') return <p role="status" className="py-8">{t('auth.checkingSession')}</p>;
  if (state === 'error') return <div className="py-8">
    <p role="alert">{t('auth.connectionRetry')}</p>
    <button onClick={() => setAttempt(value => value + 1)} className="mt-4 rounded bg-slate-900 px-4 py-2 text-white">{t('auth.retry')}</button>
  </div>;
  return <form onSubmit={unlock} className="my-8 max-w-md rounded-xl border border-slate-200 p-6">
    <h2 className="text-lg font-semibold">{t('auth.adminUnlockTitle')}</h2>
    <p className="my-3 text-sm text-slate-600">{t('auth.adminUnlockDescription')}</p>
    <label className="block text-sm font-medium">
      {t('auth.confirmPassword')}
      <input type="password" autoComplete="current-password" value={password} maxLength={128}
        onChange={event => setPassword(event.target.value)} required
        className="mt-2 w-full rounded border border-slate-300 px-3 py-2" />
    </label>
    {error && <p role="alert" className="mt-3 text-sm text-rose-700">{error}</p>}
    <button type="submit" disabled={busy || !password} className="mt-4 rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-50">
      {t(busy ? 'auth.checkingSession' : 'auth.adminUnlock')}
    </button>
  </form>;
}
