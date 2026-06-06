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
  const [adminView, setAdminView] = useState('users');

  return (
    <section className="py-8">
      <div className="mb-6 flex flex-wrap gap-2 border-b border-slate-200">
        {[
          { id: 'users', label: 'User Management' },
          { id: 'feedback', label: 'Feedback Review' },
          { id: 'analytics', label: 'Analytics' },
          { id: 'health', label: 'System Health' }
        ].map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setAdminView(item.id)}
            className={`border-b-2 px-3 py-2 text-sm font-semibold transition-colors ${
              adminView === item.id
                ? 'border-slate-950 text-slate-950'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {adminView === 'users' ? (
        <AdminUsersPanel apiUrl={apiUrl} userNumber={userNumber} />
      ) : adminView === 'feedback' ? (
        <AdminFeedbackPanel apiUrl={apiUrl} userNumber={userNumber} />
      ) : adminView === 'analytics' ? (
        <AdminAnalyticsPanel apiUrl={apiUrl} userNumber={userNumber} />
      ) : (
        <AdminSystemHealthPanel apiUrl={apiUrl} userNumber={userNumber} />
      )}
    </section>
  );
}

function AdminUsersPanel({ apiUrl, userNumber }) {
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
    <div>
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
    </div>
  );
}

function AdminFeedbackPanel({ apiUrl, userNumber }) {
  const [feedback, setFeedback] = useState([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updatingId, setUpdatingId] = useState(null);
  const adminParams = { user_number: userNumber };

  const loadFeedback = async () => {
    setLoading(true);
    setError('');
    try {
      const params = statusFilter ? { ...adminParams, status: statusFilter } : adminParams;
      const response = await axios.get(`${apiUrl}/api/admin/feedback`, { params });
      setFeedback(response.data.feedback || []);
    } catch (err) {
      setError(err.response?.data?.detail || 'Feedback could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFeedback();
  }, [apiUrl, userNumber, statusFilter]);

  const updateStatus = async (feedbackId, status) => {
    setUpdatingId(feedbackId);
    setError('');
    try {
      await axios.patch(
        `${apiUrl}/api/admin/feedback/${feedbackId}`,
        { status },
        { params: adminParams }
      );
      await loadFeedback();
    } catch (err) {
      setError(err.response?.data?.detail || 'Feedback status could not be updated.');
    } finally {
      setUpdatingId(null);
    }
  };

  const feedbackTypes = Array.from(new Set(feedback.map((item) => item.feedback_type).filter(Boolean))).sort();
  const visibleFeedback = typeFilter
    ? feedback.filter((item) => item.feedback_type === typeFilter)
    : feedback;

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Feedback Review</h2>
          <p className="mt-1 text-sm text-slate-500">Review user feedback from Alfred responses and track follow-up status.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <label className="text-sm font-medium text-slate-700">
            Status
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="mt-1 block rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
            >
              <option value="">All</option>
              <option value="New">New</option>
              <option value="Reviewed">Reviewed</option>
              <option value="Resolved">Resolved</option>
              <option value="Ignored">Ignored</option>
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700">
            Type
            <select
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value)}
              className="mt-1 block rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
            >
              <option value="">All</option>
              {feedbackTypes.map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <AdminAIBriefingBox
        apiUrl={apiUrl}
        userNumber={userNumber}
        briefingType="feedback"
        buttonLabel="Summarize Feedback"
        emptyText="No feedback intelligence generated yet."
      />

      {error && (
        <div className="mb-6 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Source Page</th>
              <th className="px-4 py-3">Feedback Type</th>
              <th className="px-4 py-3">Rating</th>
              <th className="px-4 py-3">Comment</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {loading ? (
              <tr>
                <td className="px-4 py-6 text-slate-500" colSpan="8">Loading feedback...</td>
              </tr>
            ) : visibleFeedback.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-slate-500" colSpan="8">No feedback found.</td>
              </tr>
            ) : visibleFeedback.map((item) => (
              <tr key={item.id}>
                <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-900">{item.user}</td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatDate(item.date)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-600 capitalize">{item.source_page || '-'}</td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-600">{item.feedback_type}</td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-600">{item.rating ? `${item.rating}/5` : '-'}</td>
                <td className="min-w-72 max-w-xl px-4 py-3 text-slate-700">
                  <div>{item.comment || '-'}</div>
                  {item.message_excerpt && (
                    <div className="mt-1 line-clamp-2 text-xs text-slate-400">{item.message_excerpt}</div>
                  )}
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  <span className="rounded bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
                    {item.status || 'New'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => updateStatus(item.id, 'Reviewed')}
                      disabled={updatingId === item.id}
                      className="rounded border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                      Mark Reviewed
                    </button>
                    <button
                      type="button"
                      onClick={() => updateStatus(item.id, 'Resolved')}
                      disabled={updatingId === item.id}
                      className="rounded border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                      Mark Resolved
                    </button>
                    <button
                      type="button"
                      onClick={() => updateStatus(item.id, 'Ignored')}
                      disabled={updatingId === item.id}
                      className="rounded border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                      Ignore
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AdminAnalyticsPanel({ apiUrl, userNumber }) {
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const adminParams = { user_number: userNumber };

  const loadAnalytics = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await axios.get(`${apiUrl}/api/admin/analytics`, { params: adminParams });
      setAnalytics(response.data);
    } catch (err) {
      setError(err.response?.data?.detail || 'Analytics could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAnalytics();
  }, [apiUrl, userNumber]);

  if (loading) {
    return <div className="py-6 text-sm text-slate-500">Loading analytics...</div>;
  }

  if (error) {
    return (
      <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
        {error}
      </div>
    );
  }

  const platformMetrics = analytics?.platform_metrics || [];
  const userMetrics = analytics?.user_metrics || [];
  const topPages = analytics?.top_pages_30_days || [];
  const recentEvents = analytics?.recent_events_30_days || [];

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-slate-900">User Analytics & Adoption</h2>
        <p className="mt-1 text-sm text-slate-500">Track platform usage, adoption, and user-level activity.</p>
      </div>

      <AdminAIBriefingBox
        apiUrl={apiUrl}
        userNumber={userNumber}
        briefingType="usage"
        buttonLabel="Analyze Adoption"
        emptyText="No adoption intelligence generated yet."
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {platformMetrics.map((metric) => (
          <div key={metric.label} className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{metric.label}</div>
            <div className="mt-2 text-2xl font-bold text-slate-950">{metric.value}</div>
            {metric.hint && <div className="mt-1 text-xs text-slate-400">{metric.hint}</div>}
          </div>
        ))}
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900">Top Pages - 30 Days</div>
          <div className="divide-y divide-slate-100">
            {topPages.length === 0 ? (
              <div className="px-4 py-4 text-sm text-slate-500">No page usage tracked yet.</div>
            ) : topPages.map((item) => (
              <div key={item.page} className="flex items-center justify-between px-4 py-3 text-sm">
                <span className="text-slate-700">{item.page}</span>
                <span className="font-semibold text-slate-950">{item.count}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900">Recent Events - 30 Days</div>
          <div className="divide-y divide-slate-100">
            {recentEvents.length === 0 ? (
              <div className="px-4 py-4 text-sm text-slate-500">No events tracked yet.</div>
            ) : recentEvents.map((item) => (
              <div key={`${item.event_type}-${item.page}`} className="flex items-center justify-between px-4 py-3 text-sm">
                <span className="text-slate-700">{item.event_type} - {item.page}</span>
                <span className="font-semibold text-slate-950">{item.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-8 overflow-x-auto rounded-lg border border-slate-200">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Last Active</th>
              <th className="px-4 py-3">Sessions</th>
              <th className="px-4 py-3">Pages Used</th>
              <th className="px-4 py-3">Features Used</th>
              <th className="px-4 py-3">Messages</th>
              <th className="px-4 py-3">Tasks</th>
              <th className="px-4 py-3">Habits</th>
              <th className="px-4 py-3">Journal</th>
              <th className="px-4 py-3">Journey</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {userMetrics.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-slate-500" colSpan="10">No users found.</td>
              </tr>
            ) : userMetrics.map((user) => (
              <tr key={user.user_id}>
                <td className="whitespace-nowrap px-4 py-3">
                  <div className="font-medium text-slate-900">{user.name}</div>
                  <div className="text-xs text-slate-400">{user.email || '-'}</div>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatDate(user.last_active_date)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-600">{user.sessions}</td>
                <td className="min-w-48 px-4 py-3 text-slate-600">{(user.pages_used || []).join(', ') || '-'}</td>
                <td className="min-w-48 px-4 py-3 text-slate-600">{(user.features_used || []).join(', ') || '-'}</td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-600">{user.messages_sent}</td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-600">{user.tasks_completed}</td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-600">{user.habits_completed}</td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-600">{user.journal_entries}</td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-600">{user.journey_progress}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AdminSystemHealthPanel({ apiUrl, userNumber }) {
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const adminParams = { user_number: userNumber };

  const loadHealth = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await axios.get(`${apiUrl}/api/admin/system-health`, { params: adminParams });
      setHealth(response.data);
    } catch (err) {
      setError(err.response?.data?.detail || 'System health could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHealth();
  }, [apiUrl, userNumber]);

  if (loading) {
    return <div className="py-6 text-sm text-slate-500">Loading system health...</div>;
  }

  if (error) {
    return (
      <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
        {error}
      </div>
    );
  }

  const summary = health?.summary || {};
  const database = health?.database || {};
  const environment = health?.environment || {};
  const deployment = health?.deployment_status || {};
  const railwayLogs = health?.railway_logs || {};
  const recentErrors = health?.recent_errors || [];
  const eventTypes = summary.events_by_type_7_days || [];
  const healthTiles = [
    { label: 'Recent Errors', value: summary.recent_errors || 0 },
    { label: 'OpenAI Failures', value: summary.openai_failures || 0 },
    { label: 'Database Failures', value: summary.database_failures || 0 },
    { label: 'Email Failures', value: summary.email_failures || 0 },
    { label: 'Auth Failures', value: summary.authentication_failures || 0 },
    { label: 'Slow Requests', value: summary.slow_requests || 0 },
    { label: 'Railway Errors', value: (railwayLogs.error_logs || []).length }
  ];

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">System Health</h2>
          <p className="mt-1 text-sm text-slate-500">Monitor recent failures, response times, and service readiness.</p>
        </div>
        <button
          type="button"
          onClick={loadHealth}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Refresh
        </button>
      </div>

      <AdminAIBriefingBox
        apiUrl={apiUrl}
        userNumber={userNumber}
        briefingType="operations"
        buttonLabel="Analyze Operations"
        emptyText="No operations intelligence generated yet."
      />

      <div className="mb-6 rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className={`rounded px-2 py-1 text-xs font-semibold ${
            health?.status === 'Healthy'
              ? 'bg-emerald-50 text-emerald-700'
              : health?.status === 'Watch'
                ? 'bg-amber-50 text-amber-700'
                : 'bg-rose-50 text-rose-700'
          }`}>
            {health?.status || 'Unknown'}
          </span>
          <span className="text-sm text-slate-500">Checked {formatDate(health?.checked_at)}</span>
          <span className="text-sm text-slate-500">Database: {database.status || 'Unknown'}{database.response_time_ms != null ? ` (${database.response_time_ms} ms)` : ''}</span>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-7">
        {healthTiles.map((tile) => (
          <div key={tile.label} className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{tile.label}</div>
            <div className="mt-2 text-2xl font-bold text-slate-950">{tile.value}</div>
          </div>
        ))}
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900">API Response Times</div>
          <div className="space-y-3 px-4 py-4 text-sm text-slate-700">
            <div className="flex justify-between">
              <span>Average</span>
              <span className="font-semibold text-slate-950">{summary.api_response_times?.average_ms || 0} ms</span>
            </div>
            <div className="flex justify-between">
              <span>Max</span>
              <span className="font-semibold text-slate-950">{summary.api_response_times?.max_ms || 0} ms</span>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900">Service Readiness</div>
          <div className="space-y-3 px-4 py-4 text-sm text-slate-700">
            <div className="flex justify-between"><span>OpenAI</span><span className="font-semibold">{environment.openai_configured ? 'Configured' : 'Missing'}</span></div>
            <div className="flex justify-between"><span>Mailgun</span><span className="font-semibold">{environment.mailgun_configured ? 'Configured' : 'Missing'}</span></div>
            <div className="flex justify-between"><span>Gmail Token</span><span className="font-semibold">{environment.gmail_token_present ? 'Present' : 'Not set'}</span></div>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900">Recent Deployments</div>
          <div className="px-4 py-4 text-sm text-slate-700">
            <div className="font-semibold text-slate-950">{deployment.status || 'Unknown'}</div>
            <p className="mt-2 text-slate-500">{deployment.message || 'Deployment integration is not connected.'}</p>
            {(deployment.recent_deployments || []).length > 0 && (
              <div className="mt-4 space-y-2">
                {deployment.recent_deployments.map((item) => (
                  <div key={item.id} className="rounded border border-slate-100 px-3 py-2">
                    <div className="font-semibold text-slate-900">{item.status || 'Unknown'}</div>
                    <div className="text-xs text-slate-400">{formatDate(item.created_at)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900">Events By Type - 7 Days</div>
          <div className="divide-y divide-slate-100">
            {eventTypes.length === 0 ? (
              <div className="px-4 py-4 text-sm text-slate-500">No health events recorded yet.</div>
            ) : eventTypes.map((item) => (
              <div key={item.event_type} className="flex items-center justify-between px-4 py-3 text-sm">
                <span className="text-slate-700">{item.event_type}</span>
                <span className="font-semibold text-slate-950">{item.count}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900">Recent Alfred API Errors</div>
          <div className="divide-y divide-slate-100">
            {recentErrors.length === 0 ? (
              <div className="px-4 py-4 text-sm text-slate-500">No recent errors recorded.</div>
            ) : recentErrors.map((item) => (
              <div key={item.id} className="px-4 py-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-slate-950">{item.event_type}</span>
                  <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{item.status_code || '-'}</span>
                  <span className="text-xs text-slate-400">{formatDate(item.created_at)}</span>
                </div>
                <div className="mt-1 text-slate-600">{item.method || ''} {item.path || ''}</div>
                {item.message && <div className="mt-1 text-xs text-slate-400">{item.message}</div>}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-8 rounded-lg border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900">Railway Log Errors</div>
        <div className="divide-y divide-slate-100">
          {railwayLogs.status && railwayLogs.status !== 'Connected' && (
            <div className="px-4 py-4 text-sm text-amber-700">{railwayLogs.message || railwayLogs.status}</div>
          )}
          {(railwayLogs.error_logs || []).length === 0 ? (
            <div className="px-4 py-4 text-sm text-slate-500">No Railway error logs found for the latest deployment.</div>
          ) : railwayLogs.error_logs.map((item, index) => (
            <div key={`${item.timestamp}-${index}`} className="px-4 py-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700">{item.severity || 'error'}</span>
                <span className="text-xs text-slate-400">{formatDate(item.timestamp)}</span>
              </div>
              <div className="mt-1 text-slate-700">{item.message || '-'}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AdminAIBriefingBox({ apiUrl, userNumber, briefingType, buttonLabel, emptyText }) {
  const [briefing, setBriefing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const adminParams = { user_number: userNumber };

  const loadBriefing = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await axios.get(`${apiUrl}/api/admin/ai-briefings/${briefingType}`, { params: adminParams });
      setBriefing(response.data.briefing || null);
    } catch (err) {
      setError(err.response?.data?.detail || 'AI briefing could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  const generateBriefing = async () => {
    setGenerating(true);
    setError('');
    try {
      const response = await axios.post(
        `${apiUrl}/api/admin/ai-briefings`,
        { briefing_type: briefingType },
        { params: adminParams }
      );
      setBriefing(response.data.briefing || null);
    } catch (err) {
      setError(err.response?.data?.detail || 'AI briefing could not be generated.');
    } finally {
      setGenerating(false);
    }
  };

  useEffect(() => {
    loadBriefing();
  }, [apiUrl, userNumber, briefingType]);

  return (
    <div className="mb-6 rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">AI Intelligence</h3>
          <p className="mt-1 text-sm text-slate-500">
            {loading ? 'Loading latest briefing...' : briefing ? `Generated ${formatDate(briefing.created_at)}` : emptyText}
          </p>
        </div>
        <button
          type="button"
          onClick={generateBriefing}
          disabled={generating}
          className="rounded-md bg-slate-950 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:bg-slate-300"
        >
          {generating ? 'Generating...' : buttonLabel}
        </button>
      </div>

      {error && (
        <div className="mt-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      )}

      {briefing && (
        <div className="mt-4 border-t border-slate-100 pt-4">
          <h4 className="text-base font-semibold text-slate-950">{briefing.title}</h4>
          <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-700">{briefing.summary_text}</p>
          <div className="mt-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Top Recommendations</div>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-slate-700">
              {(briefing.top_recommendations || []).map((item, index) => (
                <li key={`${item}-${index}`}>{item}</li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </div>
  );
}
