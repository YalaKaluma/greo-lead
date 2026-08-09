import { useState } from 'react';
import { API_URL } from './config';
import { useLanguage } from './i18n/LanguageContext';
import { clearSessionCredentials } from './sessionCredentials';

export default function PasswordRecovery() {
  const { t } = useLanguage();
  const token = new URLSearchParams(window.location.search).get('token') || '';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');
    if (token && password.length < 12) {
      setError(t('recovery.passwordMinimum'));
      return;
    }
    if (token && password !== confirmation) {
      setError(t('recovery.passwordMismatch'));
      return;
    }
    setWorking(true);
    try {
      const endpoint = token ? 'reset' : 'request';
      const body = token ? { token, new_password: password } : { email };
      const response = await fetch(`${API_URL}/api/auth/password-recovery/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (!response.ok) throw new Error(t(token ? 'recovery.invalidToken' : 'recovery.requestError'));
      setMessage(t(token ? 'recovery.resetSuccess' : 'recovery.requestSuccess'));
      if (token) {
        clearSessionCredentials();
        localStorage.removeItem('user_number');
        localStorage.removeItem('user_name');
        localStorage.removeItem('must_change_password');
      }
    } catch (err) {
      setError(err.message || t('recovery.requestError'));
    } finally {
      setWorking(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-xl">
        <img src="/alfred-logo.png" alt="Alfred" className="mx-auto h-16 w-16" />
        <h1 className="mt-5 text-center text-2xl font-bold text-slate-950">
          {t(token ? 'recovery.resetTitle' : 'recovery.requestTitle')}
        </h1>
        <p className="mt-2 text-center text-sm leading-6 text-slate-600">
          {t(token ? 'recovery.resetDescription' : 'recovery.requestDescription')}
        </p>
        <form onSubmit={submit} className="mt-6 space-y-4">
          {!token ? (
            <label className="block text-sm font-semibold text-slate-800">
              {t('recovery.email')}
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2" />
            </label>
          ) : (
            <>
              <label className="block text-sm font-semibold text-slate-800">
                {t('recovery.newPassword')}
                <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" minLength={12} maxLength={128} required className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2" />
              </label>
              <label className="block text-sm font-semibold text-slate-800">
                {t('recovery.confirmPassword')}
                <input type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="new-password" minLength={12} maxLength={128} required className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2" />
              </label>
            </>
          )}
          {message && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
          {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
          {!message && (
            <button type="submit" disabled={working} className="w-full rounded-lg bg-slate-900 px-4 py-3 font-semibold text-white disabled:opacity-50">
              {t(working ? 'recovery.working' : token ? 'recovery.resetSubmit' : 'recovery.requestSubmit')}
            </button>
          )}
        </form>
        <button type="button" onClick={() => window.location.assign('/')} className="mt-5 w-full text-center text-sm font-semibold text-slate-700 hover:underline">
          {t('recovery.backToSignIn')}
        </button>
      </section>
    </main>
  );
}
