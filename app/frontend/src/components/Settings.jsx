import React, { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { useLanguage } from '../i18n/LanguageContext';
import {
  disableNotifications,
  enableNotifications,
  getIosInstallHint,
  getNotificationStatus,
  getNotificationSupport,
  sendTestNotification,
  updateNotificationPreferences
} from '../services/notifications';

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
const NativeMeetingRecorder = registerPlugin('MeetingRecorder');

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
      { id: 'notifications', label: 'Notifications' },
      { id: 'privacy', label: 'Privacy & Data' }
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
          <NotificationSettingsPanel apiUrl={apiUrl} userNumber={userNumber} />
        )}

        {activeTab === 'privacy' && (
          <section className="py-8">
            <div className="max-w-2xl">
              <h2 className="text-sm font-semibold text-slate-900">Privacy & Data</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                You can request deletion of your Alfred account and associated data from the public account deletion page.
              </p>
              <VoiceEnrollmentPanel apiUrl={apiUrl} userNumber={userNumber} />
              <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4">
                <h3 className="text-base font-semibold text-slate-950">Account deletion</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Deletion requests are handled by email so Alfred can verify account ownership before removing account information and user-created content.
                </p>
                <a
                  href="/account-deletion"
                  target="_blank"
                  rel="noreferrer"
                  className="mt-4 inline-flex rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
                >
                  Open account deletion page
                </a>
              </div>
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

function VoiceEnrollmentPanel({ apiUrl, userNumber }) {
  const [profile, setProfile] = useState({ enrolled: false });
  const [consent, setConsent] = useState(false);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const startedRef = useRef(null);
  const native = Capacitor.isNativePlatform();

  const refresh = () => fetch(`${apiUrl}/api/meetings/voice-profile?user_number=${encodeURIComponent(userNumber)}`)
    .then((response) => response.ok ? response.json() : { enrolled: false })
    .then(setProfile)
    .catch(() => {});
  useEffect(refresh, [apiUrl, userNumber]);
  useEffect(() => {
    if (!recording) return undefined;
    const timer = window.setInterval(() => {
      const elapsed = (Date.now() - startedRef.current) / 1000;
      setSeconds(elapsed);
      if (elapsed >= 9) {
        window.clearInterval(timer);
        stopSample();
      }
    }, 100);
    return () => window.clearInterval(timer);
  }, [recording]);

  const uploadSample = async (blob, filename, duration) => {
    setWorking(true); setError(''); setMessage('');
    try {
      const body = new FormData();
      body.append('user_number', userNumber);
      body.append('consent_acknowledged', 'true');
      body.append('duration_seconds', String(duration));
      body.append('file', blob, filename);
      const response = await fetch(`${apiUrl}/api/meetings/voice-profile`, { method: 'POST', body });
      if (!response.ok) throw new Error((await response.json()).detail || 'Could not save your voice sample.');
      setProfile(await response.json());
      setMessage('Your voice reference is ready. Alfred will identify it as Me in future meetings.');
    } catch (err) { setError(err.message); } finally { setWorking(false); }
  };

  const startSample = async () => {
    setError(''); setMessage(''); setSeconds(0); startedRef.current = Date.now();
    try {
      if (native) {
        await NativeMeetingRecorder.start();
      } else {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const type = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((item) => window.MediaRecorder?.isTypeSupported(item));
        const recorder = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
        chunksRef.current = []; streamRef.current = stream; recorderRef.current = recorder;
        recorder.ondataavailable = (event) => event.data?.size && chunksRef.current.push(event.data);
        recorder.start(250);
      }
      setRecording(true);
    } catch (err) { setError(err.message || 'Could not start the microphone.'); }
  };

  const stopSample = async () => {
    const duration = (Date.now() - startedRef.current) / 1000;
    setRecording(false);
    if (duration < 2) { setError('Please record for at least 2 seconds.'); return; }
    try {
      if (native) {
        const result = await NativeMeetingRecorder.stop();
        const response = await fetch(Capacitor.convertFileSrc(result.path));
        const blob = await response.blob();
        await uploadSample(new Blob([blob], { type: 'audio/mp4' }), 'my-voice.m4a', duration);
        await NativeMeetingRecorder.removeFile({ path: result.path });
      } else {
        const recorder = recorderRef.current;
        await new Promise((resolve) => { recorder.addEventListener('stop', resolve, { once: true }); recorder.stop(); });
        streamRef.current?.getTracks().forEach((track) => track.stop());
        const type = recorder.mimeType || 'audio/webm';
        await uploadSample(new Blob(chunksRef.current, { type }), type.includes('mp4') ? 'my-voice.m4a' : 'my-voice.webm', duration);
      }
    } catch (err) { setError(err.message || 'Could not save your voice sample.'); }
  };

  const remove = async () => {
    if (!window.confirm('Delete your personal voice reference?')) return;
    setWorking(true);
    try {
      const response = await fetch(`${apiUrl}/api/meetings/voice-profile?user_number=${encodeURIComponent(userNumber)}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Could not delete the voice reference.');
      setProfile({ enrolled: false }); setConsent(false); setMessage('Voice reference deleted.');
    } catch (err) { setError(err.message); } finally { setWorking(false); }
  };

  return <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4">
    <h3 className="text-base font-semibold text-slate-950">Personal voice recognition</h3>
    <p className="mt-2 text-sm leading-6 text-slate-600">Record 5–10 seconds of only your voice. Alfred will use it to label you as “Me” during future meeting transcription.</p>
    <p className={`mt-3 text-sm font-medium ${profile.enrolled ? 'text-emerald-700' : 'text-slate-500'}`}>{profile.enrolled ? 'Voice reference enrolled' : 'No voice reference enrolled'}</p>
    {!profile.enrolled && <label className="mt-4 flex items-start gap-3 text-sm text-slate-700"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} className="mt-1" /><span>I consent to Alfred storing and using this sample solely to identify my voice in my meeting transcripts.</span></label>}
    <div className="mt-4 flex flex-wrap items-center gap-3">{recording ? <><span className="font-mono text-rose-700">Recording {seconds.toFixed(1)}s</span><button disabled={seconds < 2} onClick={stopSample} className="rounded-md bg-rose-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">Stop & Save</button></> : <button disabled={(!consent && !profile.enrolled) || working} onClick={startSample} className="rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:bg-slate-300">{profile.enrolled ? 'Replace voice reference' : 'Record my voice'}</button>}{profile.enrolled && <button disabled={working || recording} onClick={remove} className="rounded-md border border-rose-300 px-4 py-2 text-sm font-semibold text-rose-700">Delete voice reference</button>}</div>
    {recording && seconds > 10 && <p className="mt-3 text-sm text-rose-700">The sample is too long. Stop and record again.</p>}
    {message && <p className="mt-3 text-sm text-emerald-700">{message}</p>}{error && <p className="mt-3 text-sm text-rose-700">{error}</p>}
  </div>;
}

function NotificationSettingsPanel({ apiUrl, userNumber }) {
  const [support, setSupport] = useState(() => getNotificationSupport());
  const [status, setStatus] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isWorking, setIsWorking] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);

  const iosHint = getIosInstallHint();
  const activeCount = status?.active_subscription_count || 0;
  const permissionLabel = support.permission === 'default' ? 'Not asked yet' : support.permission;
  const supportLabel = support.nativeApp ? 'Installed app' : (support.supported ? 'Supported' : 'Not supported');
  const keysLabel = support.nativeApp
    ? (status?.native_push_configured ? 'Configured' : 'Needs Firebase')
    : (status?.vapid_public_key ? 'Configured' : 'Not configured');
  const canEnable = support.supported && support.permission !== 'denied' && (
    support.nativeApp ? Boolean(status?.native_push_configured) : Boolean(status?.vapid_public_key)
  );

  const refreshStatus = async () => {
    if (!userNumber) return;
    setIsLoading(true);
    setError(null);
    try {
      setSupport(getNotificationSupport());
      const nextStatus = await getNotificationStatus(apiUrl, userNumber);
      setStatus(nextStatus);
    } catch (requestError) {
      setError(requestError.message || 'Alfred could not load notification status.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refreshStatus();
  }, [apiUrl, userNumber]);

  const runAction = async (action, successMessage) => {
    setIsWorking(true);
    setMessage(null);
    setError(null);
    try {
      const result = await action();
      setMessage(successMessage(result));
      await refreshStatus();
    } catch (actionError) {
      setError(actionError.message || 'Alfred could not update notifications yet.');
    } finally {
      setIsWorking(false);
    }
  };

  const handleEnable = () => runAction(
    () => enableNotifications(apiUrl, userNumber),
    () => 'Notifications are enabled on this device.'
  );

  const handleDisableDevice = () => runAction(
    () => disableNotifications(apiUrl, userNumber),
    () => 'Notifications are disabled on this device.'
  );

  const handleGlobalToggle = () => runAction(
    () => updateNotificationPreferences(apiUrl, userNumber, {
      notifications_enabled: !status?.notifications_enabled
    }),
    () => status?.notifications_enabled ? 'Notifications are paused.' : 'Notifications are allowed.'
  );

  const handleTest = () => runAction(
    () => sendTestNotification(apiUrl, userNumber),
    (result) => {
      const sent = result?.result?.sent || 0;
      const reason = result?.result?.reason;
      if (sent > 0) return 'Test notification sent.';
      if (reason === 'no_active_subscriptions') return 'No active device is subscribed yet.';
      if (reason === 'notifications_disabled') return 'Notifications are paused in your preferences.';
      if (reason === 'vapid_not_configured') return 'Notification keys are not configured yet.';
      if (reason === 'firebase_not_configured') return 'Firebase is not configured on the server yet.';
      if (reason === 'firebase_dependencies_unavailable') return 'The server is missing its Firebase notification support.';
      if (reason?.startsWith('fcm_error_')) return `Firebase rejected the notification: ${reason}`;
      if (result?.result?.failed > 0) return 'The notification could not be delivered. The server recorded a delivery failure.';
      return 'Test notification attempted.';
    }
  );

  return (
    <section className="py-8">
      <div className="max-w-2xl">
        <h2 className="text-sm font-semibold text-slate-900">Notifications</h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          Enable Alfred alerts for this device. Each phone, tablet, or desktop can be managed separately.
        </p>

        <div className="mt-6 grid gap-3 text-sm sm:grid-cols-2">
          <StatusRow label="Device support" value={supportLabel} />
          <StatusRow label="Permission" value={permissionLabel} />
          <StatusRow label="Notification keys" value={keysLabel} />
          <StatusRow label="Active devices" value={isLoading ? 'Loading...' : String(activeCount)} />
        </div>

        {iosHint && (
          <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">
            {iosHint}
          </p>
        )}

        {!support.supported && (
          <p className="mt-4 rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-600">
            This browser cannot receive Alfred notifications. Use a supported desktop browser, Android Chrome, or an installed iPhone/iPad Home Screen app.
          </p>
        )}

        {support.permission === 'denied' && (
          <p className="mt-4 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-700">
            Notifications are blocked in this browser. Update site permissions, then return here to enable Alfred alerts.
          </p>
        )}

        {status && !support.nativeApp && !status.vapid_public_key && (
          <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">
            Alfred needs VAPID keys configured before browsers can subscribe.
          </p>
        )}

        {status && support.nativeApp && !status.native_push_configured && (
          <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">
            Alfred needs Firebase Cloud Messaging configured before the installed app can receive nudges.
          </p>
        )}

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleEnable}
            disabled={!canEnable || isWorking || isLoading}
            className="rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {isWorking ? 'Working...' : 'Enable on this device'}
          </button>

          <button
            type="button"
            onClick={handleDisableDevice}
            disabled={isWorking || isLoading || activeCount === 0}
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
          >
            Disable this device
          </button>

          <button
            type="button"
            onClick={handleGlobalToggle}
            disabled={isWorking || isLoading || !status}
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
          >
            {status?.notifications_enabled ? 'Pause all notifications' : 'Allow all notifications'}
          </button>

          <button
            type="button"
            onClick={handleTest}
            disabled={isWorking || isLoading || activeCount === 0}
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
          >
            Send test
          </button>
        </div>

        {status?.subscriptions?.length > 0 && (
          <div className="mt-6 overflow-hidden rounded-lg border border-slate-200">
            <div className="grid grid-cols-[1fr_auto] gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase text-slate-500">
              <span>Device</span>
              <span>Status</span>
            </div>
            {status.subscriptions.map((subscription) => (
              <div key={subscription.id} className="grid grid-cols-[1fr_auto] gap-3 border-b border-slate-100 px-4 py-3 text-sm last:border-b-0">
                <div>
                  <p className="font-medium text-slate-900">
                    {subscription.device_label || subscription.browser || 'Device'}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {subscription.platform || 'Unknown platform'}
                  </p>
                </div>
                <span className={subscription.is_active ? 'text-emerald-700' : 'text-slate-400'}>
                  {subscription.is_active ? 'Active' : 'Off'}
                </span>
              </div>
            ))}
          </div>
        )}

        {message && (
          <p className="mt-4 text-sm text-emerald-700">{message}</p>
        )}
        {error && (
          <p className="mt-4 text-sm text-rose-700">{error}</p>
        )}
      </div>
    </section>
  );
}

function StatusRow({ label, value }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white px-4 py-3">
      <p className="text-xs font-semibold uppercase text-slate-500">{label}</p>
      <p className="mt-1 font-medium text-slate-900">{value}</p>
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
          { id: 'operations', label: 'Operations Director' },
          { id: 'cto', label: 'CTO Director' },
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
      ) : adminView === 'operations' ? (
        <AdminOperationsDirectorPanel apiUrl={apiUrl} userNumber={userNumber} />
      ) : adminView === 'cto' ? (
        <AdminCTODirectorPanel apiUrl={apiUrl} userNumber={userNumber} />
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

function AdminOperationsDirectorPanel({ apiUrl, userNumber }) {
  const [drafts, setDrafts] = useState([]);
  const [healthEvents, setHealthEvents] = useState([]);
  const [executiveSummary, setExecutiveSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [reviewing, setReviewing] = useState(false);
  const [actingDraftId, setActingDraftId] = useState(null);
  const [expandedDraftId, setExpandedDraftId] = useState(null);
  const [chatMessages, setChatMessages] = useState([
    { role: 'director', content: 'I am watching health events, recurring failures, and GitHub-ready drafts. Ask what needs attention first.' }
  ]);
  const [chatInput, setChatInput] = useState('');
  const [chatSending, setChatSending] = useState(false);
  const [error, setError] = useState('');
  const adminParams = { user_number: userNumber };
  const severityRank = { critical: 0, high: 1, error: 1, medium: 2, warning: 2, low: 3, info: 4 };

  const sortByCriticality = (items) => [...items].sort((a, b) => {
    const severityA = severityRank[String(a.severity || '').toLowerCase()] ?? 5;
    const severityB = severityRank[String(b.severity || '').toLowerCase()] ?? 5;
    if (severityA !== severityB) return severityA - severityB;
    const timeA = new Date(a.evidence?.last_seen || a.last_seen_at || a.created_at || 0).getTime();
    const timeB = new Date(b.evidence?.last_seen || b.last_seen_at || b.created_at || 0).getTime();
    return timeB - timeA;
  });

  const buildFallbackSummary = (draftItems, eventItems) => {
    const openItems = draftItems.filter((draft) => ['draft', 'approved', 'known_issue'].includes(draft.status));
    const criticalOrHigh = openItems.filter((draft) => ['critical', 'high', 'error'].includes(String(draft.severity || '').toLowerCase()));
    const recurring = eventItems.filter((event) => (event.occurrence_count || 1) >= 3 && !event.resolved_at);
    const topIssue = sortByCriticality(openItems)[0];
    return {
      headline: `${criticalOrHigh.length} critical/high draft${criticalOrHigh.length === 1 ? '' : 's'} and ${recurring.length} recurring health signal${recurring.length === 1 ? '' : 's'} need review.`,
      recommendation: topIssue
        ? `Review "${topIssue.title}" first and decide whether to create the GitHub issue.`
        : recurring.length
          ? 'Run review to convert recurring health events into issue drafts.'
          : 'No urgent operations action is waiting right now.',
      open_drafts: openItems.length,
      critical_or_high: criticalOrHigh.length,
      recurring_events: recurring.length,
      top_issue_title: topIssue?.title || null
    };
  };

  const loadOperations = async ({ showLoading = true } = {}) => {
    if (showLoading) setLoading(true);
    setError('');
    try {
      const [draftResponse, eventsResponse] = await Promise.all([
        axios.get(`${apiUrl}/api/admin/operations/issue-drafts`, { params: adminParams }),
        axios.get(`${apiUrl}/api/admin/operations/health-events`, { params: adminParams })
      ]);
      setDrafts(draftResponse.data.issue_drafts || []);
      setHealthEvents(eventsResponse.data.health_events || []);
      setExecutiveSummary(
        draftResponse.data.executive_summary
        || buildFallbackSummary(draftResponse.data.issue_drafts || [], eventsResponse.data.health_events || [])
      );
    } catch (err) {
      setError(err.response?.data?.detail || 'Alfred Operations Director could not be loaded.');
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  const runReview = async () => {
    setReviewing(true);
    setError('');
    try {
      await axios.post(`${apiUrl}/api/admin/operations/review`, null, { params: adminParams });
      await loadOperations({ showLoading: false });
    } catch (err) {
      setError(err.response?.data?.detail || 'Operations review could not be completed.');
    } finally {
      setReviewing(false);
    }
  };

  const runDraftAction = async (draft, action) => {
    setActingDraftId(draft.id);
    setError('');
    try {
      await axios.post(`${apiUrl}/api/admin/operations/issue-drafts/${draft.id}/${action}`, null, { params: adminParams });
      await loadOperations({ showLoading: false });
    } catch (err) {
      setError(err.response?.data?.detail || 'Draft action failed.');
    } finally {
      setActingDraftId(null);
    }
  };

  const sendChatMessage = async (event) => {
    event.preventDefault();
    const message = chatInput.trim();
    if (!message || chatSending) return;

    setChatInput('');
    setChatMessages((current) => [...current, { role: 'admin', content: message }]);
    setChatSending(true);
    setError('');

    try {
      const response = await axios.post(
        `${apiUrl}/api/admin/operations/chat`,
        { message },
        { params: adminParams }
      );
      setChatMessages((current) => [...current, { role: 'director', content: response.data.reply || 'I could not produce a response yet.' }]);
      if (response.data.executive_summary) {
        setExecutiveSummary(response.data.executive_summary);
      }
    } catch (err) {
      setChatMessages((current) => [...current, { role: 'director', content: 'I could not answer from the operations context yet.' }]);
      setError(err.response?.data?.detail || 'Operations Director chat failed.');
    } finally {
      setChatSending(false);
    }
  };

  useEffect(() => {
    loadOperations();
  }, [apiUrl, userNumber]);

  if (loading) {
    return <div className="py-6 text-sm text-slate-500">Loading Alfred Operations Director...</div>;
  }

  const openDrafts = drafts.filter((draft) => ['draft', 'approved', 'known_issue'].includes(draft.status));
  const sortedDrafts = sortByCriticality(drafts);
  const visibleDrafts = sortedDrafts.slice(0, 25);
  const hiddenDraftCount = Math.max(sortedDrafts.length - visibleDrafts.length, 0);
  const recentEvents = sortByCriticality(healthEvents).slice(0, 8);
  const summary = executiveSummary || buildFallbackSummary(drafts, healthEvents);

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Alfred Operations Director</h2>
          <p className="mt-1 text-sm text-slate-500">Review grouped operational failures and approve Codex-ready GitHub issues.</p>
        </div>
        <button
          type="button"
          onClick={runReview}
          disabled={reviewing}
          className="rounded-md bg-slate-950 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:bg-slate-300"
        >
          {reviewing ? 'Reviewing...' : 'Run Review'}
        </button>
      </div>

      {error && (
        <div className="mb-6 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      <div className="mb-6 grid gap-4 lg:grid-cols-5">
        <div className="rounded-lg border border-slate-200 bg-white p-4 lg:col-span-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Executive Summary</div>
          <h3 className="mt-2 text-xl font-semibold text-slate-950">{summary.headline}</h3>
          <p className="mt-3 text-sm leading-6 text-slate-700">{summary.recommendation}</p>
          <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
            <div className="rounded border border-slate-100 px-3 py-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Critical / High</div>
              <div className="mt-1 text-lg font-bold text-slate-950">{summary.critical_or_high || 0}</div>
            </div>
            <div className="rounded border border-slate-100 px-3 py-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Open Drafts</div>
              <div className="mt-1 text-lg font-bold text-slate-950">{summary.open_drafts || 0}</div>
            </div>
            <div className="rounded border border-slate-100 px-3 py-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Recurring Signals</div>
              <div className="mt-1 text-lg font-bold text-slate-950">{summary.recurring_events || 0}</div>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4 lg:col-span-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Ask Alfred Operations Director</div>
          <div className="mt-3 max-h-64 space-y-3 overflow-auto">
            {chatMessages.map((message, index) => (
              <div
                key={`${message.role}-${index}`}
                className={`rounded-md px-3 py-2 text-sm leading-6 ${
                  message.role === 'admin'
                    ? 'bg-slate-950 text-white'
                    : 'bg-slate-50 text-slate-700'
                }`}
              >
                {message.content}
              </div>
            ))}
          </div>
          <form onSubmit={sendChatMessage} className="mt-3 flex gap-2">
            <input
              value={chatInput}
              onChange={(event) => setChatInput(event.target.value)}
              placeholder="What needs attention first?"
              className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            <button
              type="submit"
              disabled={chatSending || !chatInput.trim()}
              className="rounded-md bg-slate-950 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:bg-slate-300"
            >
              {chatSending ? 'Asking...' : 'Ask'}
            </button>
          </form>
        </div>
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Open Drafts</div>
          <div className="mt-2 text-2xl font-bold text-slate-950">{openDrafts.length}</div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Health Events</div>
          <div className="mt-2 text-2xl font-bold text-slate-950">{healthEvents.length}</div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">GitHub Created</div>
          <div className="mt-2 text-2xl font-bold text-slate-950">{drafts.filter((draft) => draft.status === 'github_created').length}</div>
        </div>
      </div>

      <div className="space-y-4">
        {drafts.length === 0 ? (
          <div className="rounded-lg border border-slate-200 bg-white px-4 py-6 text-sm text-slate-500">
            No issue drafts yet. Run review after health events have been captured.
          </div>
        ) : (
          <>
            {hiddenDraftCount > 0 && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                Showing the top {visibleDrafts.length} drafts by criticality. {hiddenDraftCount} lower-priority drafts are hidden from this view.
              </div>
            )}
            {visibleDrafts.map((draft) => {
          const expanded = expandedDraftId === draft.id;
          const acting = actingDraftId === draft.id;
          const evidence = draft.evidence || {};

          return (
            <div key={draft.id} className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-semibold text-slate-950">{draft.title}</h3>
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">{draft.status}</span>
                    <span className="rounded bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">{draft.severity}</span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-700">{draft.summary}</p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setExpandedDraftId(expanded ? null : draft.id)}
                    className="rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    {expanded ? 'Hide Brief' : 'Preview Brief'}
                  </button>
                  <button
                    type="button"
                    onClick={() => runDraftAction(draft, 'create-github-issue')}
                    disabled={acting || draft.status === 'github_created'}
                    className="rounded-md bg-slate-950 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:bg-slate-300"
                  >
                    {draft.status === 'github_created' ? 'GitHub Created' : acting ? 'Working...' : 'Create GitHub Issue'}
                  </button>
                  <button
                    type="button"
                    onClick={() => runDraftAction(draft, 'mark-known')}
                    disabled={acting || draft.status === 'github_created'}
                    className="rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    Mark as Known
                  </button>
                  <button
                    type="button"
                    onClick={() => runDraftAction(draft, 'dismiss')}
                    disabled={acting || draft.status === 'github_created'}
                    className="rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    Dismiss
                  </button>
                </div>
              </div>

              <div className="mt-4 grid gap-3 text-sm text-slate-700 md:grid-cols-2 lg:grid-cols-4">
                <div><span className="font-semibold text-slate-950">Environment:</span> {draft.environment || 'unknown'}</div>
                <div><span className="font-semibold text-slate-950">Category:</span> {draft.category || 'unknown'}</div>
                <div><span className="font-semibold text-slate-950">Occurrences:</span> {evidence.occurrences || 0}</div>
                <div><span className="font-semibold text-slate-950">Target:</span> {evidence.affected_target || 'unknown'}</div>
                <div><span className="font-semibold text-slate-950">First seen:</span> {formatDate(evidence.first_seen)}</div>
                <div><span className="font-semibold text-slate-950">Last seen:</span> {formatDate(evidence.last_seen)}</div>
                <div><span className="font-semibold text-slate-950">Issue:</span> {draft.github_issue_url ? <a className="text-blue-700 hover:underline" href={draft.github_issue_url} target="_blank" rel="noreferrer">#{draft.github_issue_number}</a> : '-'}</div>
                <div><span className="font-semibold text-slate-950">Labels:</span> {(draft.github_labels || []).join(', ') || '-'}</div>
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Suspected Root Cause</div>
                  <p className="mt-1 text-sm leading-6 text-slate-700">{draft.suspected_root_cause || '-'}</p>
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Recommended Action</div>
                  <p className="mt-1 text-sm leading-6 text-slate-700">{draft.recommended_action || '-'}</p>
                </div>
              </div>

              {expanded && (
                <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Codex-ready Brief Preview</div>
                  <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap text-sm leading-6 text-slate-700">{draft.codex_brief_markdown}</pre>
                </div>
              )}
            </div>
          );
            })}
          </>
        )}
      </div>

      <div className="mt-8 rounded-lg border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900">Recent Health Events</div>
        <div className="divide-y divide-slate-100">
          {recentEvents.length === 0 ? (
            <div className="px-4 py-4 text-sm text-slate-500">No health events recorded yet.</div>
          ) : recentEvents.map((event) => (
            <div key={event.id} className="px-4 py-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-slate-950">{event.category}</span>
                <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{event.severity}</span>
                <span className="text-xs text-slate-400">{formatDate(event.last_seen_at)}</span>
              </div>
              <div className="mt-1 text-slate-600">{event.method || ''} {event.endpoint || event.job_name || event.source || ''}</div>
              {event.message && <div className="mt-1 text-xs text-slate-400">{event.message}</div>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AdminCTODirectorPanel({ apiUrl, userNumber }) {
  const [reviews, setReviews] = useState([]);
  const [findings, setFindings] = useState([]);
  const [executiveSummary, setExecutiveSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [reviewing, setReviewing] = useState(false);
  const [actingFindingId, setActingFindingId] = useState(null);
  const [expandedFindingId, setExpandedFindingId] = useState(null);
  const [error, setError] = useState('');
  const adminParams = { user_number: userNumber };
  const severityRank = { critical: 0, high: 1, warning: 2, medium: 2, low: 3, info: 4 };

  const sortByCriticality = (items) => [...items].sort((a, b) => {
    const severityA = severityRank[String(a.severity || '').toLowerCase()] ?? 5;
    const severityB = severityRank[String(b.severity || '').toLowerCase()] ?? 5;
    if (severityA !== severityB) return severityA - severityB;
    return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
  });

  const buildFallbackSummary = (reviewItems, findingItems) => {
    const openItems = findingItems.filter((finding) => finding.status === 'open');
    const criticalOrHigh = openItems.filter((finding) => ['critical', 'high'].includes(String(finding.severity || '').toLowerCase()));
    const latest = reviewItems[0];
    const top = sortByCriticality(openItems)[0];
    return {
      headline: `${criticalOrHigh.length} high/critical CTO finding${criticalOrHigh.length === 1 ? '' : 's'} and ${openItems.length} open GitHub-ready draft${openItems.length === 1 ? '' : 's'} need review.`,
      recommendation: top
        ? `Review "${top.title}" first and decide whether to create the GitHub issue.`
        : latest
          ? 'No urgent CTO finding is waiting for approval.'
          : 'Run CTO Review to create the latest architecture and release-readiness view.',
      open_findings: openItems.length,
      critical_or_high: criticalOrHigh.length,
      converted_to_issue: findingItems.filter((finding) => finding.status === 'converted_to_issue').length,
      scores: latest ? {
        architecture: latest.architecture_score,
        security: latest.security_score,
        maintainability: latest.maintainability_score,
        test_readiness: latest.test_coverage_score,
        release_readiness: latest.release_readiness_score
      } : {}
    };
  };

  const loadCTO = async ({ showLoading = true } = {}) => {
    if (showLoading) setLoading(true);
    setError('');
    try {
      const [reviewResponse, findingResponse] = await Promise.all([
        axios.get(`${apiUrl}/api/admin/cto/reviews`, { params: adminParams }),
        axios.get(`${apiUrl}/api/admin/cto/findings`, { params: adminParams })
      ]);
      const nextReviews = reviewResponse.data.reviews || [];
      const nextFindings = findingResponse.data.findings || [];
      setReviews(nextReviews);
      setFindings(nextFindings);
      setExecutiveSummary(reviewResponse.data.executive_summary || buildFallbackSummary(nextReviews, nextFindings));
    } catch (err) {
      setError(err.response?.data?.detail || 'Alfred CTO Director could not be loaded.');
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  const runReview = async () => {
    setReviewing(true);
    setError('');
    try {
      await axios.post(`${apiUrl}/api/admin/cto/reviews/run`, null, { params: adminParams });
      await loadCTO({ showLoading: false });
    } catch (err) {
      setError(err.response?.data?.detail || 'CTO review could not be completed.');
    } finally {
      setReviewing(false);
    }
  };

  const runFindingAction = async (finding, action) => {
    setActingFindingId(finding.id);
    setError('');
    try {
      await axios.post(`${apiUrl}/api/admin/cto/findings/${finding.id}/${action}`, null, { params: adminParams });
      await loadCTO({ showLoading: false });
    } catch (err) {
      setError(err.response?.data?.detail || 'Finding action failed.');
    } finally {
      setActingFindingId(null);
    }
  };

  useEffect(() => {
    loadCTO();
  }, [apiUrl, userNumber]);

  if (loading) {
    return <div className="py-6 text-sm text-slate-500">Loading Alfred CTO Director...</div>;
  }

  const summary = executiveSummary || buildFallbackSummary(reviews, findings);
  const scores = summary.scores || {};
  const latestReview = reviews[0];
  const openFindings = findings.filter((finding) => finding.status === 'open');
  const sortedFindings = sortByCriticality(findings);
  const highPriority = sortedFindings.filter((finding) => ['critical', 'high'].includes(String(finding.severity || '').toLowerCase()));
  const technicalDebt = sortedFindings.filter((finding) => ['architecture', 'documentation', 'dependency'].includes(finding.category));
  const securityFindings = sortedFindings.filter((finding) => finding.category === 'security');
  const testFindings = sortedFindings.filter((finding) => finding.category === 'testing');
  const releaseFindings = sortedFindings.filter((finding) => ['migration', 'release_readiness'].includes(finding.category));
  const sections = [
    { title: 'High-priority findings', items: highPriority },
    { title: 'Technical debt', items: technicalDebt },
    { title: 'Security risks', items: securityFindings },
    { title: 'Testing and CI gaps', items: testFindings },
    { title: 'Migration and release risks', items: releaseFindings }
  ];
  const scoreCards = [
    { label: 'Architecture', value: scores.architecture },
    { label: 'Security', value: scores.security },
    { label: 'Maintainability', value: scores.maintainability },
    { label: 'Test Readiness', value: scores.test_readiness },
    { label: 'Release Readiness', value: scores.release_readiness }
  ];

  const renderFindingCard = (finding) => {
    const expanded = expandedFindingId === finding.id;
    const acting = actingFindingId === finding.id;
    return (
      <div key={finding.id} className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="text-base font-semibold text-slate-950">{finding.title}</h4>
              <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">{finding.status}</span>
              <span className="rounded bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">{finding.severity}</span>
              <span className="rounded bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">{finding.category}</span>
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-700">{finding.summary}</p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setExpandedFindingId(expanded ? null : finding.id)}
              className="rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              {expanded ? 'Hide Brief' : 'Preview Brief'}
            </button>
            <button
              type="button"
              onClick={() => runFindingAction(finding, 'create-github-issue')}
              disabled={acting || finding.status === 'converted_to_issue'}
              className="rounded-md bg-slate-950 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:bg-slate-300"
            >
              {finding.status === 'converted_to_issue' ? 'GitHub Created' : acting ? 'Working...' : 'Create GitHub Issue'}
            </button>
            <button
              type="button"
              onClick={() => runFindingAction(finding, 'dismiss')}
              disabled={acting || finding.status === 'converted_to_issue'}
              className="rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Dismiss
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 text-sm text-slate-700 md:grid-cols-2 lg:grid-cols-4">
          <div><span className="font-semibold text-slate-950">Files:</span> {(finding.affected_files || []).slice(0, 3).join(', ') || '-'}</div>
          <div><span className="font-semibold text-slate-950">Modules:</span> {(finding.affected_modules || []).join(', ') || '-'}</div>
          <div><span className="font-semibold text-slate-950">Confidence:</span> {finding.confidence || '-'}</div>
          <div><span className="font-semibold text-slate-950">Issue:</span> {finding.github_issue_url ? <a className="text-blue-700 hover:underline" href={finding.github_issue_url} target="_blank" rel="noreferrer">#{finding.github_issue_number}</a> : '-'}</div>
          <div className="lg:col-span-2"><span className="font-semibold text-slate-950">Risk:</span> {finding.risk_explanation || '-'}</div>
          <div className="lg:col-span-2"><span className="font-semibold text-slate-950">Recommendation:</span> {finding.recommended_action || '-'}</div>
        </div>

        {expanded && (
          <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Codex-ready Brief Preview</div>
            <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap text-sm leading-6 text-slate-700">{finding.codex_brief_markdown}</pre>
          </div>
        )}
      </div>
    );
  };

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Alfred CTO Director</h2>
          <p className="mt-1 text-sm text-slate-500">Review architecture risk, technical debt, tests, security posture, and release readiness.</p>
        </div>
        <button
          type="button"
          onClick={runReview}
          disabled={reviewing}
          className="rounded-md bg-slate-950 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:bg-slate-300"
        >
          {reviewing ? 'Reviewing...' : 'Run CTO Review'}
        </button>
      </div>

      {error && (
        <div className="mb-6 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      <div className="mb-6 rounded-lg border border-slate-200 bg-white p-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Executive Summary</div>
        <h3 className="mt-2 text-xl font-semibold text-slate-950">{summary.headline}</h3>
        <p className="mt-3 text-sm leading-6 text-slate-700">{summary.recommendation}</p>
        {latestReview && (
          <p className="mt-2 text-sm leading-6 text-slate-500">{latestReview.summary}</p>
        )}
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {scoreCards.map((card) => (
          <div key={card.label} className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{card.label}</div>
            <div className="mt-2 text-2xl font-bold text-slate-950">{card.value ?? '-'}</div>
          </div>
        ))}
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Open Findings</div>
          <div className="mt-2 text-2xl font-bold text-slate-950">{openFindings.length}</div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Critical / High</div>
          <div className="mt-2 text-2xl font-bold text-slate-950">{summary.critical_or_high || 0}</div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">GitHub Created</div>
          <div className="mt-2 text-2xl font-bold text-slate-950">{summary.converted_to_issue || 0}</div>
        </div>
      </div>

      {findings.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-6 text-sm text-slate-500">
          No CTO findings yet. Run CTO Review to inspect the repository and operational signals.
        </div>
      ) : (
        <div className="space-y-6">
          {sections.map((section) => (
            <section key={section.title}>
              <h3 className="mb-3 text-sm font-semibold text-slate-900">{section.title}</h3>
              <div className="space-y-4">
                {section.items.length === 0 ? (
                  <div className="rounded-lg border border-slate-200 bg-white px-4 py-4 text-sm text-slate-500">No findings in this section.</div>
                ) : section.items.map(renderFindingCard)}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function AdminSystemHealthPanel({ apiUrl, userNumber }) {
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [analysisRefreshing, setAnalysisRefreshing] = useState(false);
  const [analysisRefreshRequest, setAnalysisRefreshRequest] = useState(0);
  const [error, setError] = useState('');
  const adminParams = { user_number: userNumber };

  const loadHealth = async ({ showLoading = true } = {}) => {
    if (showLoading) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }
    setError('');
    try {
      const response = await axios.get(`${apiUrl}/api/admin/system-health`, { params: adminParams });
      setHealth(response.data);
    } catch (err) {
      setError(err.response?.data?.detail || 'System health could not be loaded.');
    } finally {
      if (showLoading) {
        setLoading(false);
      } else {
        setRefreshing(false);
      }
    }
  };

  const refreshHealthAndAnalysis = () => {
    loadHealth({ showLoading: false });
    setAnalysisRefreshRequest((current) => current + 1);
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
          onClick={refreshHealthAndAnalysis}
          disabled={refreshing || analysisRefreshing}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {refreshing || analysisRefreshing ? 'Refreshing...' : 'Refresh Health & Analysis'}
        </button>
      </div>

      <AdminAIBriefingBox
        apiUrl={apiUrl}
        userNumber={userNumber}
        briefingType="operations"
        emptyText="No operations intelligence generated yet."
        enableCodexTask
        hideAction
        refreshRequest={analysisRefreshRequest}
        onGeneratingChange={setAnalysisRefreshing}
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

function AdminAIBriefingBox({
  apiUrl,
  userNumber,
  briefingType,
  buttonLabel,
  emptyText,
  busyLabel = 'Generating...',
  enableCodexTask = false,
  hideAction = false,
  refreshRequest = 0,
  onGeneratingChange
}) {
  const [briefing, setBriefing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [expandedBriefIndex, setExpandedBriefIndex] = useState(null);
  const [addingTaskIndex, setAddingTaskIndex] = useState(null);
  const [createdTaskIndexes, setCreatedTaskIndexes] = useState({});
  const [error, setError] = useState('');
  const adminParams = { user_number: userNumber };

  const loadBriefing = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await axios.get(`${apiUrl}/api/admin/ai-briefings/${briefingType}`, { params: adminParams });
      setBriefing(response.data.briefing || null);
      setExpandedBriefIndex(null);
      setCreatedTaskIndexes({});
    } catch (err) {
      setError(err.response?.data?.detail || 'AI briefing could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  const generateBriefing = async () => {
    setGenerating(true);
    onGeneratingChange?.(true);
    setError('');
    try {
      const response = await axios.post(
        `${apiUrl}/api/admin/ai-briefings`,
        { briefing_type: briefingType },
        { params: adminParams }
      );
      setBriefing(response.data.briefing || null);
      setExpandedBriefIndex(null);
      setCreatedTaskIndexes({});
    } catch (err) {
      setError(err.response?.data?.detail || 'AI briefing could not be generated.');
    } finally {
      setGenerating(false);
      onGeneratingChange?.(false);
    }
  };

  const todayISO = () => {
    const today = new Date();
    const offsetDate = new Date(today.getTime() - today.getTimezoneOffset() * 60000);
    return offsetDate.toISOString().split('T')[0];
  };

  const formatOperationalLogsForTask = () => {
    const snapshot = briefing?.source_snapshot || {};
    const lines = [];
    const recentErrors = Array.isArray(snapshot.recent_errors) ? snapshot.recent_errors.slice(0, 8) : [];
    const railwayLogs = Array.isArray(snapshot.railway_error_logs) ? snapshot.railway_error_logs.slice(0, 8) : [];

    if (snapshot.status) lines.push(`Status: ${snapshot.status}`);
    if (snapshot.database?.status) {
      lines.push(`Database: ${snapshot.database.status}${snapshot.database.response_time_ms ? ` (${snapshot.database.response_time_ms} ms)` : ''}`);
    }
    if (snapshot.deployment_status?.status) {
      lines.push(`Railway: ${snapshot.deployment_status.status}${snapshot.deployment_status.message ? ` - ${snapshot.deployment_status.message}` : ''}`);
    }
    if (snapshot.deployment_status?.recent_deployments?.[0]?.status) {
      lines.push(`Latest deployment: ${snapshot.deployment_status.recent_deployments[0].status}`);
    }

    if (recentErrors.length) {
      lines.push('', 'Recent API errors:');
      recentErrors.forEach((item, index) => {
        const when = item.created_at || item.timestamp || 'unknown time';
        const path = item.path || item.event_type || 'unknown path';
        const message = item.error_message || item.message || item.status_code || 'No message';
        lines.push(`${index + 1}. ${when} - ${path} - ${message}`);
      });
    }

    if (railwayLogs.length) {
      lines.push('', 'Railway error logs:');
      railwayLogs.forEach((item, index) => {
        const when = item.timestamp || 'unknown time';
        const severity = item.severity || 'error';
        const message = item.message || 'No message';
        lines.push(`${index + 1}. ${when} - ${severity} - ${message}`);
      });
    }

    return lines.join('\n') || 'No operational logs were attached to this briefing.';
  };

  const buildRecommendationTaskNotes = (recommendation) => {
    return [
      `Recommendation:\n${recommendation}`,
      `Codex brief:\n${briefing?.codex_brief || 'No Codex brief was generated for this briefing.'}`,
      `Logs and evidence:\n${formatOperationalLogsForTask()}`
    ].join('\n\n');
  };

  const addRecommendationToTasks = async (recommendation, index) => {
    if (!recommendation || createdTaskIndexes[index]) return;
    setAddingTaskIndex(index);
    setError('');
    try {
      await axios.post(
        `${apiUrl}/api/tasks/`,
        {
          title: `Codex: ${recommendation}`,
          notes: buildRecommendationTaskNotes(recommendation),
          due_date: todayISO(),
          priority: 'High',
          project: 'Admin / Operations'
        },
        { params: { user_number: userNumber } }
      );
      setCreatedTaskIndexes((current) => ({ ...current, [index]: true }));
    } catch (err) {
      setError(err.response?.data?.detail || 'Recommendation could not be added to the to-do list.');
    } finally {
      setAddingTaskIndex(null);
    }
  };

  useEffect(() => {
    loadBriefing();
  }, [apiUrl, userNumber, briefingType]);

  useEffect(() => {
    if (refreshRequest > 0) {
      generateBriefing();
    }
  }, [refreshRequest]);

  return (
    <div className="mb-6 rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">AI Intelligence</h3>
          <p className="mt-1 text-sm text-slate-500">
            {loading ? 'Loading latest briefing...' : briefing ? `Generated ${formatDate(briefing.created_at)}` : emptyText}
          </p>
        </div>
        {!hideAction && (
          <button
            type="button"
            onClick={generateBriefing}
            disabled={generating}
            className="rounded-md bg-slate-950 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:bg-slate-300"
          >
            {generating ? busyLabel : buttonLabel}
          </button>
        )}
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
            <ol className="mt-2 list-decimal space-y-3 pl-5 text-sm text-slate-700">
              {(briefing.top_recommendations || []).map((item, index) => {
                const isExpanded = expandedBriefIndex === index;
                const isAdding = addingTaskIndex === index;
                const isCreated = Boolean(createdTaskIndexes[index]);

                return (
                  <li key={`${item}-${index}`} className="pl-1">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <span className="leading-6">{item}</span>
                      {enableCodexTask && (
                        <div className="flex shrink-0 flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => setExpandedBriefIndex(isExpanded ? null : index)}
                            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            {isExpanded ? 'Hide Codex Brief' : 'See Codex Brief'}
                          </button>
                          <button
                            type="button"
                            onClick={() => addRecommendationToTasks(item, index)}
                            disabled={isAdding || isCreated}
                            className="rounded-md bg-slate-950 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:bg-slate-300"
                          >
                            {isCreated ? 'Added' : isAdding ? 'Adding...' : 'Add to To-Do List'}
                          </button>
                        </div>
                      )}
                    </div>
                    {isExpanded && (
                      <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3">
                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Brief For Codex</div>
                        <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-700">
                          {briefing.codex_brief || 'No Codex brief was generated for this briefing.'}
                        </p>
                      </div>
                    )}
                    {isCreated && (
                      <p className="mt-2 text-sm text-emerald-700">Added to today&apos;s to-do list with the Codex brief and logs.</p>
                    )}
                  </li>
                );
              })}
            </ol>
          </div>
        </div>
      )}
    </div>
  );
}
