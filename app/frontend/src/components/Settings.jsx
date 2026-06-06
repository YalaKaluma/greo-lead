import React, { useEffect, useMemo, useState } from 'react';
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

const formatDate = (value) => {
  if (!value) return 'Never';
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  }).format(new Date(value));
};

const emptyForm = {
  first_name: '',
  last_name: '',
  email: '',
  is_admin: false
};

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

  const [activeTab, setActiveTab] = useState('profile');
  const [currentUser, setCurrentUser] = useState(null);
  const [isBackfillingDepth, setIsBackfillingDepth] = useState(false);
  const [backfillResult, setBackfillResult] = useState(null);
  const [backfillError, setBackfillError] = useState(null);

  useEffect(() => {
    if (!userNumber) return;
    axios.get(`${apiUrl}/api/auth/me`, { params: { user_number: userNumber } })
      .then((response) => setCurrentUser(response.data.user))
      .catch(() => setCurrentUser(null));
  }, [apiUrl, userNumber]);

  const tabs = useMemo(() => {
    const baseTabs = [
      { id: 'profile', label: 'Profile' },
      { id: 'preferences', label: 'Preferences' },
      { id: 'notifications', label: 'Notifications' }
    ];
    if (currentUser?.is_admin) {
      baseTabs.push({ id: 'admin', label: 'Admin' });
    }
    return baseTabs;
  }, [currentUser]);

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
      setBackfillError(error.response?.data?.detail || 'Alfred could not score the recent journal messages yet.');
    } finally {
      setIsBackfillingDepth(false);
    }
  };

  return (
    <div className="min-h-full bg-white">
      <div className="mx-auto max-w-6xl px-6 py-8">
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

        <div className="mt-6 flex flex-wrap gap-2 border-b border-slate-200">
          {tabs.map((tab) => (
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
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'profile' && (
          <section className="py-8">
            <div className="max-w-xl">
              <h2 className="text-sm font-semibold text-slate-900">Profile</h2>
              <dl className="mt-4 space-y-3 text-sm">
                <div>
                  <dt className="font-medium text-slate-500">Name</dt>
                  <dd className="mt-1 text-slate-900">{currentUser?.name || 'Not set'}</dd>
                </div>
                <div>
                  <dt className="font-medium text-slate-500">Email</dt>
                  <dd className="mt-1 text-slate-900">{currentUser?.email || 'Not set'}</dd>
                </div>
              </dl>
            </div>
          </section>
        )}

        {activeTab === 'preferences' && (
          <>
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
          </>
        )}

        {activeTab === 'notifications' && (
          <section className="py-8">
            <div className="max-w-xl">
              <h2 className="text-sm font-semibold text-slate-900">Notifications</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                Notification preferences are handled through your Alfred conversation for now.
              </p>
            </div>
          </section>
        )}

        {activeTab === 'admin' && currentUser?.is_admin && (
          <AdminUserManagement apiUrl={apiUrl} userNumber={userNumber} />
        )}
      </div>
    </div>
  );
}

function AdminUserManagement({ apiUrl, userNumber }) {
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [oneTimeCredential, setOneTimeCredential] = useState(null);

  const adminParams = { user_number: userNumber };

  const loadUsers = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await axios.get(`${apiUrl}/api/admin/users`, { params: adminParams });
      setUsers(response.data.users || []);
    } catch (err) {
      setError(err.response?.data?.detail || 'Admin users could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, [apiUrl, userNumber]);

  const createUser = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setOneTimeCredential(null);
    try {
      const response = await axios.post(`${apiUrl}/api/admin/users`, form, { params: adminParams });
      setOneTimeCredential({
        title: 'Temporary Password',
        userId: response.data.user.id,
        password: response.data.temporary_password,
        invitationText: response.data.invitation_text
      });
      setForm(emptyForm);
      await loadUsers();
    } catch (err) {
      setError(err.response?.data?.detail || 'User could not be created.');
    } finally {
      setSaving(false);
    }
  };

  const runAction = async (user, action) => {
    setError('');
    setOneTimeCredential(null);
    try {
      const response = await axios.post(`${apiUrl}/api/admin/users/${user.id}/${action}`, null, { params: adminParams });
      if (response.data.temporary_password || response.data.invitation_text) {
        setOneTimeCredential({
          title: action === 'reset-password' ? 'New Temporary Password' : 'Invitation',
          userId: user.id,
          password: response.data.temporary_password,
          invitationText: response.data.invitation_text,
          emailSent: response.data.email_sent
        });
      }
      await loadUsers();
    } catch (err) {
      setError(err.response?.data?.detail || 'Admin action failed.');
    }
  };

  const toggleAdmin = async (user) => {
    setError('');
    setOneTimeCredential(null);
    try {
      await axios.patch(
        `${apiUrl}/api/admin/users/${user.id}`,
        { is_admin: !user.is_admin },
        { params: adminParams }
      );
      await loadUsers();
    } catch (err) {
      setError(err.response?.data?.detail || 'Admin role could not be updated.');
    }
  };

  const copyInvitation = async () => {
    if (!oneTimeCredential?.invitationText) return;
    await navigator.clipboard.writeText(oneTimeCredential.invitationText);
  };

  return (
    <section className="py-8">
      <div className="mb-8">
        <h2 className="text-lg font-semibold text-slate-900">User Management</h2>
        <p className="mt-1 text-sm text-slate-500">Create users, manage access, and keep admin actions auditable.</p>
      </div>

      <form onSubmit={createUser} className="mb-8 grid gap-4 rounded-lg border border-slate-200 p-4 md:grid-cols-5">
        <input
          value={form.first_name}
          onChange={(event) => setForm({ ...form, first_name: event.target.value })}
          placeholder="First Name"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          required
        />
        <input
          value={form.last_name}
          onChange={(event) => setForm({ ...form, last_name: event.target.value })}
          placeholder="Last Name"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          required
        />
        <input
          value={form.email}
          onChange={(event) => setForm({ ...form, email: event.target.value })}
          type="email"
          placeholder="Email"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          required
        />
        <label className="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={form.is_admin}
            onChange={(event) => setForm({ ...form, is_admin: event.target.checked })}
          />
          Admin
        </label>
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:bg-slate-300"
        >
          {saving ? 'Creating...' : 'Add User'}
        </button>
      </form>

      {error && (
        <div className="mb-6 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      {oneTimeCredential && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <h3 className="text-sm font-semibold text-amber-950">{oneTimeCredential.title}</h3>
          {oneTimeCredential.password && (
            <p className="mt-2 font-mono text-lg text-amber-950">{oneTimeCredential.password}</p>
          )}
          {oneTimeCredential.emailSent ? (
            <p className="mt-2 text-sm text-emerald-700">Invitation email sent.</p>
          ) : (
            <>
              <p className="mt-2 text-sm text-amber-800">Email service is unavailable or not configured. Copy the invitation manually.</p>
              <button
                type="button"
                onClick={copyInvitation}
                className="mt-3 rounded-md border border-amber-300 bg-white px-3 py-2 text-sm font-semibold text-amber-900 hover:bg-amber-100"
              >
                Copy Invitation
              </button>
            </>
          )}
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Created Date</th>
              <th className="px-4 py-3">Last Login</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {loading ? (
              <tr>
                <td className="px-4 py-6 text-slate-500" colSpan="7">Loading users...</td>
              </tr>
            ) : users.map((user) => (
              <tr key={user.id}>
                <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-900">{user.name || 'Unnamed'}</td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-600">{user.email || '-'}</td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-600">{user.role}</td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-600">{user.status}</td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatDate(user.created_at)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatDate(user.last_login_at)}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    {user.is_active ? (
                      <button type="button" onClick={() => runAction(user, 'deactivate')} className="rounded border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                        Deactivate User
                      </button>
                    ) : (
                      <button type="button" onClick={() => runAction(user, 'reactivate')} className="rounded border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                        Reactivate User
                      </button>
                    )}
                    <button type="button" onClick={() => runAction(user, 'reset-password')} className="rounded border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                      Reset Password
                    </button>
                    <button type="button" onClick={() => runAction(user, 'send-invitation')} className="rounded border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                      Send Invitation
                    </button>
                    <button type="button" onClick={() => toggleAdmin(user)} className="rounded border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                      {user.is_admin ? 'Remove Admin' : 'Make Admin'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
