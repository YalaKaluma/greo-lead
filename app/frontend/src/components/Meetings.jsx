import { useEffect, useMemo, useRef, useState } from 'react';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { useLanguage } from '../i18n/LanguageContext';

const NativeMeetingRecorder = registerPlugin('MeetingRecorder');

const STATUS_LABELS = {
  draft: 'Recording draft',
  queued: 'Queued',
  transcribing: 'Transcribing',
  analyzing: 'Analyzing',
  ready: 'Ready',
  failed: 'Needs attention'
};

const formatDate = (value) => value
  ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
  : 'Date not available';

const formatDuration = (seconds) => {
  if (!Number.isFinite(Number(seconds))) return '—';
  const total = Number(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  return hours ? `${hours}h ${minutes}m` : `${minutes}m`;
};

const formatTimer = (seconds) => {
  const hours = Math.floor(seconds / 3600).toString().padStart(2, '0');
  const minutes = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
  const remainder = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${hours}:${minutes}:${remainder}`;
};

const toDateTimeLocal = (value) => {
  if (!value) return '';
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
};

function Confidence({ value }) {
  if (value == null) return null;
  return <span className="text-xs text-slate-500">{Math.round(value * 100)}% confidence</span>;
}

function Evidence({ children }) {
  if (!children) return null;
  return <blockquote className="mt-2 border-l-2 border-slate-300 pl-3 text-sm italic text-slate-600">“{children}”</blockquote>;
}

function LeadershipFeedback({ feedback, fallback }) {
  const text = feedback || fallback;
  const labels = ['Demonstrated', 'Growth edge', 'Next meeting'];
  const matches = [...text.matchAll(/(?:^|\n|\s)(Demonstrated|Growth edge|Next meeting):\s*/gi)];

  if (matches.length !== labels.length) {
    return <p className="mt-3 whitespace-pre-line text-sm leading-6 text-slate-700">{text}</p>;
  }

  const sections = matches.map((match, index) => ({
    label: match[1],
    text: text.slice(match.index + match[0].length, matches[index + 1]?.index ?? text.length).trim()
  }));

  return <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
    {sections.map((section) => <li key={section.label} className="flex gap-2">
      <span aria-hidden="true" className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
      <span><strong className="font-semibold text-slate-900">{section.label}:</strong> {section.text}</span>
    </li>)}
  </ul>;
}

const LEADERSHIP_DOMAIN_ORDER = ['Vision', 'People', 'Prioritize & Execute', 'Time & Energy', 'Learning & Development'];
const SCORE_COLORS = { 1: '#dc2626', 2: '#f97316', 3: '#facc15', 4: '#6ee7b7', 5: '#16a34a' };

function LeadershipDomainWheel({ assessments = [] }) {
  const { t } = useLanguage();
  const byDomain = Object.fromEntries(assessments.map((item) => [item.domain, item]));
  const polar = (angle, radius) => ({ x: 180 + radius * Math.cos((angle - 90) * Math.PI / 180), y: 180 + radius * Math.sin((angle - 90) * Math.PI / 180) });
  const segmentPath = (index) => {
    const start = index * 72;
    const end = start + 72;
    const outerStart = polar(start, 150); const outerEnd = polar(end, 150);
    const innerEnd = polar(end, 58); const innerStart = polar(start, 58);
    return `M ${outerStart.x} ${outerStart.y} A 150 150 0 0 1 ${outerEnd.x} ${outerEnd.y} L ${innerEnd.x} ${innerEnd.y} A 58 58 0 0 0 ${innerStart.x} ${innerStart.y} Z`;
  };
  return <div className="space-y-8">
    <div>
      <svg viewBox="0 0 360 360" className="mx-auto w-full max-w-[390px]" role="img" aria-label={t('meetings.leadership.wheelAria')}>
        {LEADERSHIP_DOMAIN_ORDER.map((domain, index) => {
          const item = byDomain[domain];
          const label = polar(index * 72 + 36, 108);
          const words = t(`meetings.leadership.domain.${domain}`).split('|');
          return <g key={domain}><path d={segmentPath(index)} fill={SCORE_COLORS[item?.score] || '#e2e8f0'} stroke="white" strokeWidth="3" />
            <text x={label.x} y={label.y - ((words.length - 1) * 8)} textAnchor="middle" className="fill-slate-900 text-[11px] font-semibold">{words.map((word, line) => <tspan key={word} x={label.x} dy={line ? 15 : 0}>{word}</tspan>)}</text>
          </g>;
        })}
        <circle cx="180" cy="180" r="53" fill="#020617" />
        <text x="180" y="174" textAnchor="middle" className="fill-white text-[15px] font-semibold">{t('meetings.leadership.hub')}</text>
        <text x="180" y="194" textAnchor="middle" className="fill-amber-300 text-[11px]">{t('meetings.leadership.hubFeedback')}</text>
      </svg>
      <div className="mt-2 flex justify-center gap-3 text-xs text-slate-600">{[1, 2, 3, 4, 5].map((score) => <span key={score} className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: SCORE_COLORS[score] }} />{score}</span>)}</div>
    </div>
    <div className="space-y-3">{LEADERSHIP_DOMAIN_ORDER.map((domain) => { const item = byDomain[domain]; return <div key={domain} className="rounded-xl border border-slate-200 bg-slate-50 p-5"><div className="flex items-center justify-between gap-4"><h3 className="font-semibold text-slate-950">{t(`meetings.leadership.domain.${domain}`).replace('|', ' ')}</h3><span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${item?.score ? 'text-slate-950' : 'bg-slate-200 text-slate-600'}`} style={item?.score ? { backgroundColor: SCORE_COLORS[item.score] } : undefined}>{item?.score ? `${item.score}/5` : t('meetings.leadership.notAssessed')}</span></div><LeadershipFeedback feedback={item?.feedback} fallback={t('meetings.leadership.emptyDomain')} /><Evidence>{item?.evidence_excerpt}</Evidence></div>; })}</div>
  </div>;
}

export function AddMeetingModal({ onClose, onCreated, apiUrl, userNumber, projectId = null }) {
  const [mode, setMode] = useState(null);
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [file, setFile] = useState(null);
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const submitNotes = async () => {
    setSubmitting(true);
    setError('');
    try {
      const response = await fetch(`${apiUrl}/api/meetings/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_number: userNumber, title: title || null, notes, project_id: projectId })
      });
      if (!response.ok) throw new Error((await response.json()).detail || 'Could not add meeting notes.');
      onCreated(await response.json());
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const submitUpload = async () => {
    setSubmitting(true);
    setError('');
    try {
      const body = new FormData();
      body.append('user_number', userNumber);
      if (projectId) body.append('project_id', String(projectId));
      body.append('consent_acknowledged', String(consent));
      body.append('file', file);
      if (title) body.append('title', title);
      const response = await fetch(`${apiUrl}/api/meetings/upload`, { method: 'POST', body });
      if (!response.ok) throw new Error((await response.json()).detail || 'Could not upload recording.');
      onCreated(await response.json());
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (mode === 'recording') {
    return <RecordingExperience apiUrl={apiUrl} userNumber={userNumber} projectId={projectId} onCancel={onClose} onCreated={onCreated} />;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
      <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wider text-blue-600">Meeting Intelligence</p>
            <h2 className="mt-1 text-2xl font-semibold text-slate-950">Add Meeting</h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Close">✕</button>
        </div>

        {!mode && (
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {[
              ['recording', 'Record Meeting', 'Bring Alfred into a live meeting.'],
              ['upload', 'Upload Recording', 'MP3, WAV, M4A, MP4, or WebM.'],
              ['notes', 'Write Meeting Notes', 'Paste notes or a transcript.']
            ].map(([id, label, copy]) => (
              <button key={id} onClick={() => setMode(id)} className="rounded-xl border border-slate-200 p-5 text-left hover:border-blue-400 hover:bg-blue-50">
                <span className="font-semibold text-slate-900">{label}</span>
                <span className="mt-2 block text-sm text-slate-600">{copy}</span>
              </button>
            ))}
          </div>
        )}

        {mode && mode !== 'recording' && (
          <div className="mt-6 space-y-4">
            <button onClick={() => setMode(null)} className="text-sm font-medium text-blue-600">← Back to options</button>
            <label className="block text-sm font-medium text-slate-700">
              Meeting title <span className="font-normal text-slate-400">(optional)</span>
              <input value={title} onChange={(event) => setTitle(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" placeholder="Weekly leadership meeting" />
            </label>
            {mode === 'notes' ? (
              <label className="block text-sm font-medium text-slate-700">
                Notes or transcript
                <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={12} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" placeholder="Paste the meeting notes here…" />
              </label>
            ) : (
              <>
                <label className="block rounded-xl border-2 border-dashed border-slate-300 p-6 text-center hover:border-blue-400">
                  <span className="block font-medium text-slate-800">{file?.name || 'Choose an audio recording'}</span>
                  <span className="mt-1 block text-sm text-slate-500">Maximum file size: 250 MB</span>
                  <input type="file" accept="audio/*,.m4a,.mp4,.webm" className="sr-only" onChange={(event) => setFile(event.target.files?.[0] || null)} />
                </label>
                <ConsentCheck checked={consent} onChange={setConsent} />
              </>
            )}
            {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
            <button
              onClick={mode === 'notes' ? submitNotes : submitUpload}
              disabled={submitting || (mode === 'notes' ? !notes.trim() : !file || !consent)}
              className="w-full rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {submitting ? 'Adding meeting…' : mode === 'notes' ? 'Process Meeting Notes' : 'Upload and Process'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ConsentCheck({ checked, onChange }) {
  return (
    <label className="flex items-start gap-3 rounded-lg bg-amber-50 p-4 text-sm text-amber-950">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="mt-1" />
      <span>I confirm that participants have been informed of the recording and that I have permission to record in accordance with applicable laws and organizational policies.</span>
    </label>
  );
}

function RecordingExperience({ apiUrl, userNumber, projectId, onCancel, onCreated }) {
  const { t } = useLanguage();
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState('idle');
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState('');
  const [draftId, setDraftId] = useState(null);
  const draftIdRef = useRef(null);
  const [people, setPeople] = useState([]);
  const [selectedPeople, setSelectedPeople] = useState([]);
  const [noteText, setNoteText] = useState('');
  const [contextNotes, setContextNotes] = useState([]);
  const [savingContext, setSavingContext] = useState(false);
  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const startedAtRef = useRef(null);
  const nativePlatform = Capacitor.getPlatform();
  const usesNativeRecorder = nativePlatform === 'android';
  const isIosApp = nativePlatform === 'ios';

  useEffect(() => {
    fetch(`${apiUrl}/api/meetings/context/options?user_number=${encodeURIComponent(userNumber)}`)
      .then((response) => response.ok ? response.json() : null)
      .then((data) => setPeople(data?.people || []))
      .catch(() => {});
  }, [apiUrl, userNumber]);

  useEffect(() => {
    if (status !== 'recording') return undefined;
    const interval = window.setInterval(() => setSeconds(Math.floor((Date.now() - startedAtRef.current) / 1000)), 500);
    return () => window.clearInterval(interval);
  }, [status]);

  useEffect(() => () => streamRef.current?.getTracks().forEach((track) => track.stop()), []);

  const start = async () => {
    try {
      setError('');
      const startedAt = new Date();
      const draftResponse = await fetch(`${apiUrl}/api/meetings/drafts`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_number: userNumber, consent_acknowledged: consent, project_id: projectId, started_at: startedAt.toISOString() })
      });
      if (!draftResponse.ok) throw new Error((await draftResponse.json()).detail || 'Could not start the meeting draft.');
      const draft = await draftResponse.json();
      setDraftId(draft.id);
      draftIdRef.current = draft.id;
      if (usesNativeRecorder) {
        await NativeMeetingRecorder.start();
        startedAtRef.current = startedAt.getTime();
        setStatus('recording');
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const preferredType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((type) => window.MediaRecorder?.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, preferredType ? { mimeType: preferredType, audioBitsPerSecond: 48000 } : { audioBitsPerSecond: 48000 });
      chunksRef.current = [];
      streamRef.current = stream;
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => event.data?.size && chunksRef.current.push(event.data);
      recorder.onstop = upload;
      recorder.start(1000);
      startedAtRef.current = startedAt.getTime();
      setStatus('recording');
    } catch (err) {
      setError(err?.name === 'NotAllowedError' ? 'Microphone permission was denied.' : 'Alfred could not start the microphone.');
    }
  };

  const upload = async () => {
    setStatus('uploading');
    streamRef.current?.getTracks().forEach((track) => track.stop());
    const type = recorderRef.current?.mimeType || 'audio/webm';
    const extension = type.includes('mp4') ? 'm4a' : 'webm';
    const blob = new Blob(chunksRef.current, { type });
    try {
      const body = new FormData();
      body.append('user_number', userNumber);
      if (projectId) body.append('project_id', String(projectId));
      body.append('consent_acknowledged', 'true');
      body.append('source_type', 'recording');
      body.append('duration_seconds', String(seconds));
      body.append('started_at', new Date(startedAtRef.current).toISOString());
      if (draftIdRef.current) body.append('meeting_id', String(draftIdRef.current));
      body.append('file', blob, `meeting-${Date.now()}.${extension}`);
      const response = await fetch(`${apiUrl}/api/meetings/upload`, { method: 'POST', body });
      if (!response.ok) throw new Error((await response.json()).detail || 'Upload failed.');
      onCreated(await response.json());
    } catch (err) {
      setStatus('failed');
      setError(err.message);
    }
  };

  const stop = async () => {
    if (!usesNativeRecorder) {
      recorderRef.current?.stop();
      return;
    }
    setStatus('uploading');
    try {
      const result = await NativeMeetingRecorder.stop();
      const localUrl = Capacitor.convertFileSrc(result.path);
      const response = await fetch(localUrl);
      if (!response.ok) throw new Error('Could not read the completed recording.');
      const blob = await response.blob();
      const body = new FormData();
      body.append('user_number', userNumber);
      if (projectId) body.append('project_id', String(projectId));
      body.append('consent_acknowledged', 'true');
      body.append('source_type', 'recording');
      body.append('duration_seconds', String(seconds));
      body.append('started_at', new Date(startedAtRef.current).toISOString());
      if (draftIdRef.current) body.append('meeting_id', String(draftIdRef.current));
      body.append('file', blob, `meeting-${Date.now()}.m4a`);
      const uploadResponse = await fetch(`${apiUrl}/api/meetings/upload`, { method: 'POST', body });
      if (!uploadResponse.ok) throw new Error((await uploadResponse.json()).detail || 'Upload failed.');
      await NativeMeetingRecorder.removeFile({ path: result.path });
      onCreated(await uploadResponse.json());
    } catch (err) {
      setStatus('failed');
      setError(err.message || 'Could not save the native recording.');
    }
  };

  const pauseResume = async () => {
    if (usesNativeRecorder) {
      try {
        if (status === 'recording') {
          await NativeMeetingRecorder.pause();
          setStatus('paused');
        } else {
          await NativeMeetingRecorder.resume();
          startedAtRef.current = Date.now() - seconds * 1000;
          setStatus('recording');
        }
      } catch (err) { setError(err.message || 'Could not update the recording.'); }
      return;
    }
    const recorder = recorderRef.current;
    if (!recorder) return;
    if (recorder.state === 'recording') {
      recorder.pause();
      setStatus('paused');
    } else if (recorder.state === 'paused') {
      recorder.resume();
      startedAtRef.current = Date.now() - seconds * 1000;
      setStatus('recording');
    }
  };

  const togglePerson = async (personId) => {
    if (!draftId) return;
    const next = selectedPeople.includes(personId)
      ? selectedPeople.filter((id) => id !== personId)
      : [...selectedPeople, personId];
    setSelectedPeople(next);
    setSavingContext(true);
    try {
      const response = await fetch(`${apiUrl}/api/meetings/${draftId}/live-attendees`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_number: userNumber, person_ids: next })
      });
      if (!response.ok) throw new Error('Could not save attendees.');
    } catch (err) {
      setSelectedPeople(selectedPeople);
      setError(err.message);
    } finally { setSavingContext(false); }
  };

  const addContextNote = async () => {
    if (!draftId || !noteText.trim()) return;
    setSavingContext(true);
    try {
      const response = await fetch(`${apiUrl}/api/meetings/${draftId}/context-notes`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_number: userNumber, note_text: noteText.trim(), elapsed_seconds: seconds })
      });
      if (!response.ok) throw new Error('Could not save this context note.');
      const savedNote = await response.json();
      setContextNotes((current) => [...current, savedNote]);
      setNoteText('');
    } catch (err) { setError(err.message); } finally { setSavingContext(false); }
  };

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-slate-950 p-5 text-white">
      {(status === 'idle' || status === 'failed') && <button onClick={onCancel} className="absolute right-6 top-6 rounded-lg px-3 py-2 text-slate-300 hover:bg-white/10">Cancel</button>}
      <div className="mx-auto flex min-h-full max-w-5xl flex-col items-center justify-center py-8">
      <img
        src="/alfred-logo.png"
        alt="Alfred"
        className="mb-5 h-24 w-24 rounded-full border border-amber-300/40 object-cover"
      />
      <h2 className="text-3xl font-semibold">{status === 'idle' ? 'Ready to Record' : status === 'uploading' ? 'Saving Meeting' : 'Alfred is listening'}</h2>
      <p className="mt-3 font-mono text-5xl tracking-wider">{formatTimer(seconds)}</p>
      {status === 'idle' && <div className="mt-7 max-w-xl"><ConsentCheck checked={consent} onChange={setConsent} /></div>}
      {(status === 'recording' || status === 'paused') && (
        <div className="mt-5 flex items-center gap-2 rounded-full bg-red-600/20 px-4 py-2 text-sm font-semibold text-red-100">
          <span className={`h-2.5 w-2.5 rounded-full ${status === 'recording' ? 'animate-pulse bg-red-400' : 'bg-amber-300'}`} />
          {status === 'recording' ? 'Recording in progress' : 'Recording paused'}
        </div>
      )}
      {error && <p className="mt-5 rounded-lg bg-red-500/20 px-4 py-3 text-red-100">{error}</p>}
      {(status === 'recording' || status === 'paused') && <div className="mt-7 grid w-full gap-5 md:grid-cols-2">
        <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <div className="flex items-center justify-between"><h3 className="font-semibold">People in this meeting</h3>{savingContext && <span className="text-xs text-slate-400">Saving…</span>}</div>
          <p className="mt-1 text-sm text-slate-400">Select people from My Team.</p>
          <div className="mt-4 max-h-48 space-y-2 overflow-y-auto">{people.length ? people.map((person) => <label key={person.id} className="flex cursor-pointer items-center gap-3 rounded-lg bg-white/5 px-3 py-2 hover:bg-white/10"><input type="checkbox" checked={selectedPeople.includes(person.id)} onChange={() => togglePerson(person.id)} /><span>{person.title}</span></label>) : <p className="text-sm text-slate-400">No people have been added to My Team yet.</p>}</div>
        </section>
        <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <h3 className="font-semibold">Context notes for Alfred</h3><p className="mt-1 text-sm text-slate-400">Notes are timestamped and treated as context, not spoken dialogue.</p>
          <div className="mt-4 flex gap-2"><textarea rows={2} value={noteText} onChange={(event) => setNoteText(event.target.value)} placeholder="Berk owns the client relationship…" className="min-w-0 flex-1 rounded-lg border border-white/20 bg-slate-900 px-3 py-2 text-white placeholder:text-slate-500" /><button disabled={!noteText.trim() || savingContext} onClick={addContextNote} className="self-end rounded-lg bg-blue-600 px-4 py-2 font-semibold disabled:opacity-40">Add</button></div>
          <div className="mt-3 max-h-32 space-y-2 overflow-y-auto">{contextNotes.map((note) => <div key={note.id} className="rounded-lg bg-white/5 px-3 py-2 text-sm"><span className="mr-2 font-mono text-xs text-slate-400">{formatTimer(note.elapsed_seconds)}</span>{note.note_text}</div>)}</div>
        </section>
      </div>}
      <div className="mt-7 flex gap-4">
        {status === 'idle' && <button disabled={!consent} onClick={start} className="rounded-full bg-red-600 px-8 py-4 font-semibold hover:bg-red-500 disabled:bg-slate-700">Start Recording</button>}
        {(status === 'recording' || status === 'paused') && (
          <>
            <button onClick={pauseResume} className="rounded-full bg-white/10 px-8 py-4 font-semibold hover:bg-white/20">{status === 'paused' ? 'Resume' : 'Pause'}</button>
            <button onClick={stop} className="rounded-full bg-red-600 px-8 py-4 font-semibold hover:bg-red-500">Stop & Process</button>
          </>
        )}
      </div>
      <p className="mt-7 max-w-lg text-center text-sm text-slate-400">
        {usesNativeRecorder
          ? t('meetings.recording.backgroundHintAndroid')
          : isIosApp
            ? t('meetings.recording.foregroundHintIos')
            : t('meetings.recording.foregroundHintWeb')}
      </p>
      </div>
    </div>
  );
}

function EditMeetingModal({ meeting, apiUrl, userNumber, onClose, onSaved }) {
  const [form, setForm] = useState({
    title: meeting.title || '', one_line_summary: meeting.one_line_summary || '',
    executive_summary: meeting.executive_summary || '', meeting_type: meeting.meeting_type || '',
    started_at: toDateTimeLocal(meeting.started_at), user_notes: meeting.user_notes || ''
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }));
  const save = async () => {
    setSaving(true); setError('');
    try {
      const response = await fetch(`${apiUrl}/api/meetings/${meeting.id}?user_number=${encodeURIComponent(userNumber)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, started_at: form.started_at ? new Date(form.started_at).toISOString() : null })
      });
      if (!response.ok) throw new Error((await response.json()).detail || 'Could not save meeting changes.');
      onSaved(await response.json());
    } catch (err) { setError(err.message); } finally { setSaving(false); }
  };
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"><div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
    <div className="flex items-center justify-between"><h2 className="text-xl font-semibold">Edit meeting</h2><button onClick={onClose} className="rounded-lg px-3 py-2 text-slate-500 hover:bg-slate-100">Close</button></div>
    <div className="mt-5 grid gap-4 sm:grid-cols-2">
      <label className="sm:col-span-2"><span className="mb-1 block text-sm font-medium">Title</span><input value={form.title} onChange={(event) => update('title', event.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
      <label><span className="mb-1 block text-sm font-medium">Date and time</span><input type="datetime-local" value={form.started_at} onChange={(event) => update('started_at', event.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
      <label><span className="mb-1 block text-sm font-medium">Meeting type</span><input value={form.meeting_type} onChange={(event) => update('meeting_type', event.target.value)} placeholder="e.g. Executive Meeting" className="w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
      <label className="sm:col-span-2"><span className="mb-1 block text-sm font-medium">Short summary</span><textarea rows={2} value={form.one_line_summary} onChange={(event) => update('one_line_summary', event.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
      <label className="sm:col-span-2"><span className="mb-1 block text-sm font-medium">Executive summary</span><textarea rows={7} value={form.executive_summary} onChange={(event) => update('executive_summary', event.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
      <label className="sm:col-span-2"><span className="mb-1 block text-sm font-medium">Original notes</span><textarea rows={5} value={form.user_notes} onChange={(event) => update('user_notes', event.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
    </div>
    {error && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <div className="mt-6 flex justify-end gap-3"><button onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 font-semibold">Cancel</button><button disabled={saving || !form.title.trim()} onClick={save} className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white disabled:opacity-50">{saving ? 'Saving…' : 'Save changes'}</button></div>
  </div></div>;
}

export function MeetingDetail({ meeting, apiUrl, userNumber, onBack, onChanged, onDeleted }) {
  const { t } = useLanguage();
  const [transcriptSearch, setTranscriptSearch] = useState('');
  const [busyAction, setBusyAction] = useState(null);
  const [actionError, setActionError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [meetingQuestion, setMeetingQuestion] = useState('');
  const [meetingChat, setMeetingChat] = useState([]);
  const [askingAlfred, setAskingAlfred] = useState(false);
  const [meetingChatError, setMeetingChatError] = useState('');
  const [assessingLeadership, setAssessingLeadership] = useState(false);
  const [contextOptions, setContextOptions] = useState({ current_user: { title: 'Me' }, people: [], goals: [], projects: [] });
  const transcript = meeting.transcript_text || meeting.user_notes || '';
  const visibleTranscript = useMemo(() => {
    if (!transcriptSearch.trim()) return transcript;
    return transcript.split(/(?<=[.!?])\s+/).filter((line) => line.toLowerCase().includes(transcriptSearch.toLowerCase())).join('\n\n');
  }, [transcript, transcriptSearch]);

  useEffect(() => {
    fetch(`${apiUrl}/api/meetings/context/options?user_number=${encodeURIComponent(userNumber)}`)
      .then((response) => response.ok ? response.json() : null)
      .then((data) => data && setContextOptions(data))
      .catch(() => {});
  }, [apiUrl, userNumber]);

  const matchParticipant = async (participantId, selection) => {
    await fetch(`${apiUrl}/api/meetings/participants/${participantId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        user_number: userNumber,
        person_id: selection && selection !== '__me__' ? Number(selection) : null,
        is_current_user: selection === '__me__'
      })
    });
    onChanged(meeting.id);
  };

  const addContextLink = async (kind, targetId) => {
    if (!targetId) return;
    await fetch(`${apiUrl}/api/meetings/${meeting.id}/${kind}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user_number: userNumber, target_id: Number(targetId) })
    });
    onChanged(meeting.id);
  };

  const makeTask = async (actionId) => {
    setBusyAction(actionId);
    setActionError('');
    try {
      const response = await fetch(`${apiUrl}/api/meetings/action-items/${actionId}/task`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user_number: userNumber, mode: 'auto' })
      });
      if (!response.ok) throw new Error('Could not add this action to your to-do list.');
      window.dispatchEvent(new Event('alfred-sidebar-counts-refresh'));
      onChanged(meeting.id);
    } catch (error) {
      setActionError(error.message);
    } finally {
      setBusyAction(null);
    }
  };

  const ignoreAction = async (actionId) => {
    setBusyAction(actionId);
    setActionError('');
    try {
      const response = await fetch(`${apiUrl}/api/meetings/action-items/${actionId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user_number: userNumber, ignored: true })
      });
      if (!response.ok) throw new Error('Could not ignore this action item.');
      window.dispatchEvent(new Event('alfred-sidebar-counts-refresh'));
      onChanged(meeting.id);
    } catch (error) {
      setActionError(error.message);
    } finally {
      setBusyAction(null);
    }
  };

  const askAlfred = async (event) => {
    event.preventDefault();
    const question = meetingQuestion.trim();
    if (!question || askingAlfred) return;
    setAskingAlfred(true);
    setMeetingChatError('');
    try {
      const response = await fetch(`${apiUrl}/api/meetings/${meeting.id}/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_number: userNumber, question, history: meetingChat.slice(-8) })
      });
      if (!response.ok) throw new Error(t('meetings.chat.error'));
      const data = await response.json();
      setMeetingChat((current) => [...current, { role: 'user', content: question }, { role: 'assistant', content: data.answer }]);
      setMeetingQuestion('');
    } catch (error) {
      setMeetingChatError(error.message);
    } finally {
      setAskingAlfred(false);
    }
  };

  const generateLeadershipAssessment = async () => {
    setAssessingLeadership(true);
    const response = await fetch(`${apiUrl}/api/meetings/${meeting.id}/leadership-assessment?user_number=${encodeURIComponent(userNumber)}`, { method: 'POST' });
    if (!response.ok) {
      setAssessingLeadership(false);
      window.alert((await response.json()).detail || 'Could not generate the leadership assessment.');
      return;
    }
    let checks = 0;
    const poll = window.setInterval(() => {
      onChanged(meeting.id);
      checks += 1;
      if (checks >= 8) { window.clearInterval(poll); setAssessingLeadership(false); }
    }, 4000);
  };

  const deleteMeeting = async () => {
    const confirmed = window.confirm(
      'Delete this meeting permanently? This removes its recording, transcript, summary, decisions, and action items. Tasks already created from this meeting will remain.'
    );
    if (!confirmed) return;
    setDeleting(true);
    try {
      const response = await fetch(
        `${apiUrl}/api/meetings/${meeting.id}?user_number=${encodeURIComponent(userNumber)}`,
        { method: 'DELETE' }
      );
      if (!response.ok) throw new Error('Could not delete this meeting.');
      onDeleted();
    } catch (error) {
      window.alert(error.message);
      setDeleting(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl p-5 lg:p-10">
      <div className="flex items-center justify-between gap-4">
        <button onClick={onBack} className="text-sm font-semibold text-blue-600">← All meetings</button>
        <div className="flex gap-2"><button onClick={() => setEditing(true)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold hover:bg-slate-50">Edit Meeting</button><button onClick={deleteMeeting} disabled={deleting} className="rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50">
          {deleting ? 'Deleting…' : 'Delete Meeting'}
        </button></div>
      </div>
      <div className="mt-5 rounded-2xl bg-slate-900 p-7 text-white">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><p className="text-sm text-slate-400">{formatDate(meeting.started_at)} · {formatDuration(meeting.duration_seconds)}</p><h1 className="mt-2 text-3xl font-semibold">{meeting.title}</h1></div>
          <span className="rounded-full bg-white/10 px-3 py-1 text-sm">{meeting.status === 'processed' ? 'Processed' : meeting.processing_status === 'ready' ? 'Ready to process' : STATUS_LABELS[meeting.processing_status] || meeting.processing_status}</span>
        </div>
        {meeting.one_line_summary && <p className="mt-5 max-w-4xl text-lg text-slate-200">{meeting.one_line_summary}</p>}
      </div>

      {actionError && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{actionError}</p>}

      {meeting.processing_status !== 'ready' && (
        <div className={`mt-6 rounded-xl p-5 ${meeting.processing_status === 'failed' ? 'bg-red-50 text-red-800' : 'bg-blue-50 text-blue-800'}`}>
          {meeting.processing_status === 'failed' ? <div><p>{meeting.processing_error || 'Processing failed.'}</p><button onClick={async () => { await fetch(`${apiUrl}/api/meetings/${meeting.id}/retry?user_number=${encodeURIComponent(userNumber)}`, { method: 'POST' }); onChanged(meeting.id); }} className="mt-3 rounded-lg bg-red-700 px-3 py-2 text-sm font-semibold text-white">Retry processing</button></div> : 'Alfred is processing this meeting. This page will update automatically.'}
        </div>
      )}

      {meeting.processing_status === 'ready' && <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <Section title="Discussion Topics"><div className="grid gap-3 sm:grid-cols-2">{meeting.topics.map((topic) => <div key={topic.id} className="rounded-lg bg-slate-50 p-4"><h3 className="font-semibold">{topic.title}</h3><p className="mt-1 text-sm text-slate-600">{topic.summary}</p></div>)}</div></Section>
          <Section title="Executive Summary"><div className="whitespace-pre-line text-slate-700">{meeting.executive_summary || 'No summary available.'}</div></Section>
          <Section title={`Decisions (${meeting.decisions.length})`}>{meeting.decisions.length ? <div className="space-y-4">{meeting.decisions.map((decision) => <div key={decision.id}><div className="flex justify-between gap-3"><p className="font-medium text-slate-900">{decision.description}</p><Confidence value={decision.confidence} /></div><Evidence>{decision.evidence_excerpt}</Evidence></div>)}</div> : <p className="text-slate-500">No explicit decisions detected.</p>}</Section>
          <Section title={`Action Items (${meeting.action_items.length})`}>{meeting.action_items.length ? <div className="space-y-4">{meeting.action_items.map((action) => <div key={action.id} className="rounded-xl border border-slate-200 p-4"><div className="flex justify-between gap-3"><div><p className="font-medium">{action.description}</p><p className="mt-1 text-sm text-slate-500">Owner: {action.owner_name || 'Unclear'}{action.due_date ? ` · Due ${action.due_date}` : ''}</p></div><Confidence value={action.confidence} /></div><Evidence>{action.evidence_excerpt}</Evidence>{action.created_task_id ? <div className="mt-3 flex items-center gap-3"><span className="text-sm font-medium text-green-700">Added to tasks</span><button disabled={busyAction === action.id} onClick={() => makeTask(action.id)} className="text-sm font-semibold text-blue-600 hover:underline">Move to Today</button></div> : action.ignored ? <p className="mt-3 text-sm font-medium text-slate-500">Ignored</p> : <div className="mt-3 flex flex-wrap gap-2"><button disabled={busyAction === action.id} onClick={() => makeTask(action.id)} className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white">Add to My Todo</button><button disabled={busyAction === action.id} onClick={() => ignoreAction(action.id)} className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-800">Ignore</button></div>}</div>)}</div> : <p className="text-slate-500">No action items detected.</p>}</Section>
          <Section title={t('meetings.leadership.title')} privateLabel><LeadershipDomainWheel assessments={meeting.leadership_domain_assessments || []} />
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4"><p className="text-sm text-slate-500">{t('meetings.leadership.disclaimer')}</p><button onClick={generateLeadershipAssessment} disabled={assessingLeadership} className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">{assessingLeadership ? t('meetings.leadership.assessing') : meeting.leadership_domain_assessments?.length ? t('meetings.leadership.reassess') : t('meetings.leadership.assess')}</button></div>
            {meeting.leadership_observations.length > 0 && <details className="mt-5 border-t border-slate-200 pt-4"><summary className="cursor-pointer text-sm font-semibold text-slate-700">{t('meetings.leadership.additional')}</summary><div className="mt-4 space-y-4">{meeting.leadership_observations.map((item) => <div key={item.id}><p className="text-xs font-semibold uppercase tracking-wide text-amber-700">{item.category}</p><p className="mt-1 text-slate-800">{item.observation}</p><Evidence>{item.evidence_excerpt}</Evidence></div>)}</div></details>}
          </Section>
          {meeting.context_notes?.length > 0 && <Section title="Your Context Notes"><div className="space-y-3">{meeting.context_notes.map((note) => <div key={note.id} className="rounded-lg bg-amber-50 px-4 py-3"><span className="mr-3 font-mono text-xs text-amber-700">{formatTimer(note.elapsed_seconds)}</span><span className="text-slate-800">{note.note_text}</span></div>)}</div></Section>}
          <Section title="Transcript"><input value={transcriptSearch} onChange={(event) => setTranscriptSearch(event.target.value)} placeholder="Search this transcript" className="mb-4 w-full rounded-lg border border-slate-300 px-3 py-2" /><div className="max-h-[32rem] overflow-y-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-4 text-sm leading-6 text-slate-700">{visibleTranscript || 'No matching transcript text.'}</div></Section>
        </div>
        <aside className="space-y-5">
          <Section title={t('meetings.chat.title')}>
            <div className="max-h-72 space-y-3 overflow-y-auto">
              {meetingChat.length === 0 && <p className="text-sm text-slate-500">{t('meetings.chat.empty')}</p>}
              {meetingChat.map((message, index) => <div key={`${message.role}-${index}`} className={`rounded-lg px-3 py-2 text-sm ${message.role === 'user' ? 'ml-6 bg-blue-600 text-white' : 'mr-4 bg-slate-100 text-slate-800'}`}>{message.content}</div>)}
            </div>
            <form onSubmit={askAlfred} className="mt-4">
              <textarea value={meetingQuestion} onChange={(event) => setMeetingQuestion(event.target.value)} rows={3} placeholder={t('meetings.chat.placeholder')} className="w-full resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              {meetingChatError && <p className="mt-2 text-xs text-red-600">{meetingChatError}</p>}
              <button disabled={askingAlfred || !meetingQuestion.trim()} className="mt-2 w-full rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">{askingAlfred ? t('meetings.chat.thinking') : t('meetings.chat.submit')}</button>
            </form>
          </Section>
          <Section title="Overview"><dl className="space-y-3 text-sm"><div><dt className="text-slate-500">Meeting type</dt><dd className="font-medium">{meeting.meeting_type || 'Other'}</dd></div><div><dt className="text-slate-500">Participants</dt><dd className="mt-2 space-y-2">{meeting.participants.length ? meeting.participants.map((participant) => <label key={participant.id} className="block"><span className="mb-1 block text-xs font-medium">{participant.is_current_user ? 'Me' : participant.speaker_label || participant.display_name}</span><select value={participant.is_current_user ? '__me__' : participant.person_id || ''} onChange={(event) => matchParticipant(participant.id, event.target.value)} className="w-full rounded-lg border border-slate-300 px-2 py-2"><option value="">Unmatched — {participant.speaker_label || participant.display_name}</option><option value="__me__">Me — {contextOptions.current_user?.title || 'Current user'}</option>{contextOptions.people.map((person) => <option key={person.id} value={person.id}>{person.title}</option>)}</select></label>) : <span className="font-medium">Not identified</span>}</dd></div></dl></Section>
          <Section title="Related Work"><div className="space-y-4"><div><p className="mb-2 text-xs font-semibold uppercase text-slate-500">Goals</p>{meeting.related_goals?.map((goal) => <span key={goal.id} className="mb-2 mr-2 inline-block rounded-full bg-blue-50 px-3 py-1 text-xs text-blue-800">{goal.title}</span>)}<select defaultValue="" onChange={(event) => { addContextLink('goals', event.target.value); event.target.value = ''; }} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2 text-sm"><option value="">Link a goal…</option>{contextOptions.goals.map((goal) => <option key={goal.id} value={goal.id}>{goal.title}</option>)}</select></div><div><p className="mb-2 text-xs font-semibold uppercase text-slate-500">Projects</p>{meeting.related_projects?.map((project) => <span key={project.id} className="mb-2 mr-2 inline-block rounded-full bg-violet-50 px-3 py-1 text-xs text-violet-800">{project.title}</span>)}<select defaultValue="" onChange={(event) => { addContextLink('projects', event.target.value); event.target.value = ''; }} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2 text-sm"><option value="">Link a project…</option>{contextOptions.projects.map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}</select></div></div></Section>
          {meeting.has_recording && <Section title="Recording"><audio controls className="w-full" src={`${apiUrl}/api/meetings/${meeting.id}/recording?user_number=${encodeURIComponent(userNumber)}`} /><button onClick={async () => { await fetch(`${apiUrl}/api/meetings/${meeting.id}/recording?user_number=${encodeURIComponent(userNumber)}`, { method: 'DELETE' }); onChanged(meeting.id); }} className="mt-3 text-sm font-medium text-red-600">Delete recording, keep transcript</button></Section>}
        </aside>
      </div>}
      {editing && <EditMeetingModal meeting={meeting} apiUrl={apiUrl} userNumber={userNumber} onClose={() => setEditing(false)} onSaved={(updated) => { setEditing(false); onChanged(updated.id); }} />}
    </div>
  );
}

function Section({ title, children, privateLabel = false }) {
  return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-semibold text-slate-950">{title}</h2>{privateLabel && <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800">Private</span>}</div>{children}</section>;
}

function MeetingTaskCard({ task, busy, onAdd, onIgnore, onRename }) {
  const { t } = useLanguage();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(task.description);
  const [swipe, setSwipe] = useState(0);
  const touchStart = useRef(null);
  const finishEdit = async () => {
    const next = title.trim();
    if (next && next !== task.description) await onRename(task, next);
    if (!next) setTitle(task.description);
    setEditing(false);
  };
  const finishSwipe = () => {
    if (swipe >= 90) onIgnore(task);
    if (swipe <= -90) onAdd(task);
    touchStart.current = null;
    setSwipe(0);
  };
  return <div className="relative overflow-hidden rounded-lg">
    <div className="absolute inset-y-0 left-0 flex w-32 items-center bg-slate-700 pl-4 text-xs font-semibold text-white sm:hidden">{t('meetings.tasks.ignore')}</div>
    <div className="absolute inset-y-0 right-0 flex w-32 items-center justify-end bg-blue-600 pr-4 text-xs font-semibold text-white sm:hidden">{t('meetings.tasks.addToList')}</div>
    <div onTouchStart={(event) => { touchStart.current = event.touches[0].clientX; }} onTouchMove={(event) => { if (touchStart.current != null) setSwipe(Math.max(-120, Math.min(120, event.touches[0].clientX - touchStart.current))); }} onTouchEnd={finishSwipe} style={{ transform: `translateX(${swipe}px)` }} className="relative rounded-lg border-2 border-slate-200 bg-white px-4 py-3 transition-transform hover:border-slate-300">
      <div className="flex items-start gap-3">
        <button type="button" disabled={busy} onClick={() => onAdd(task)} className="mt-0.5 hidden h-5 w-5 flex-none items-center justify-center rounded-full border-2 border-slate-300 text-xs text-transparent hover:border-blue-600 hover:text-blue-600 sm:flex" aria-label={`${t('meetings.tasks.addToList')}: ${task.description}`}>✓</button>
        <div className="min-w-0 flex-1">
          {editing ? <input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} onBlur={finishEdit} onKeyDown={(event) => { if (event.key === 'Enter') finishEdit(); if (event.key === 'Escape') { setTitle(task.description); setEditing(false); } }} className="w-full rounded border border-blue-400 px-2 py-1 font-medium text-slate-900 outline-none ring-2 ring-blue-100" /> : <button type="button" onClick={() => setEditing(true)} className="block w-full text-left font-medium text-slate-900 hover:text-blue-700">{task.description}</button>}
          <p className="mt-1 truncate text-sm text-blue-600" title={task.meeting_title}>{task.meeting_title}</p>
        </div>
        <div className="hidden flex-none gap-2 sm:flex">
          <button type="button" disabled={busy} onClick={() => onAdd(task)} className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">{t('meetings.tasks.addToList')}</button>
          <button type="button" disabled={busy} onClick={() => onIgnore(task)} className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-50">{t('meetings.tasks.ignore')}</button>
        </div>
      </div>
    </div>
  </div>;
}

function MeetingTasks({ apiUrl, userNumber }) {
  const { t } = useLanguage();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);
  useEffect(() => {
    let cancelled = false;
    fetch(`${apiUrl}/api/meetings/action-items/tasks?user_number=${encodeURIComponent(userNumber)}`)
      .then((response) => { if (!response.ok) throw new Error(t('meetings.tasks.loadError')); return response.json(); })
      .then((items) => { if (!cancelled) { setTasks(items); setError(''); } })
      .catch((err) => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [apiUrl, userNumber, t]);
  const addToList = async (task) => {
    setBusyId(task.id);
    try {
      const response = await fetch(`${apiUrl}/api/meetings/action-items/${task.id}/task`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user_number: userNumber, mode: 'my_todo' }) });
      if (!response.ok) throw new Error(t('meetings.tasks.addError'));
      setTasks((items) => items.filter((item) => item.id !== task.id));
    } catch (err) { setError(err.message); } finally { setBusyId(null); }
  };
  const updateTask = async (task, changes) => {
    setBusyId(task.id);
    try {
      const response = await fetch(`${apiUrl}/api/meetings/action-items/${task.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user_number: userNumber, ...changes }) });
      if (!response.ok) throw new Error(t('meetings.tasks.updateError'));
      setTasks((items) => changes.ignored ? items.filter((item) => item.id !== task.id) : items.map((item) => item.id === task.id ? { ...item, description: changes.description } : item));
    } catch (err) { setError(err.message); } finally { setBusyId(null); }
  };
  if (loading) return <p className="mt-10 text-center text-slate-500">{t('meetings.tasks.loading')}</p>;
  return <div className="mt-6">{error && <p className="mb-4 rounded-lg bg-red-50 p-4 text-red-700">{error}</p>}{tasks.length === 0 ? <div className="rounded-2xl border-2 border-dashed border-slate-300 p-12 text-center"><h2 className="text-xl font-semibold text-slate-900">{t('meetings.tasks.emptyTitle')}</h2><p className="mt-2 text-slate-600">{t('meetings.tasks.emptyBody')}</p></div> : <div className="space-y-2">{tasks.map((task) => <MeetingTaskCard key={task.id} task={task} busy={busyId === task.id} onAdd={addToList} onIgnore={(item) => updateTask(item, { ignored: true })} onRename={(item, description) => updateTask(item, { description })} />)}</div>}<p className="mt-4 text-center text-xs text-slate-500 sm:hidden">{t('meetings.tasks.swipeHint')}</p></div>;
}

export default function Meetings({ apiUrl, userNumber }) {
  const { t } = useLanguage();
  const [meetings, setMeetings] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [editingMeeting, setEditingMeeting] = useState(null);
  const [activeTab, setActiveTab] = useState('meetings');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, total_pages: 1 });

  const loadMeetings = async () => {
    try {
      const params = new URLSearchParams({ user_number: userNumber });
      params.set('page', String(page));
      params.set('page_size', '20');
      if (search.trim()) params.set('search', search.trim());
      if (status) params.set('status', status);
      const response = await fetch(`${apiUrl}/api/meetings?${params}`);
      if (!response.ok) throw new Error('Could not load meetings.');
      const data = await response.json();
      if (data.items.length === 0 && page > data.total_pages) {
        setPage(data.total_pages);
        return;
      }
      setMeetings(data.items);
      setPagination({ total: data.total, total_pages: data.total_pages });
      setError('');
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  };

  const loadDetail = async (id) => {
    const response = await fetch(`${apiUrl}/api/meetings/${id}?user_number=${encodeURIComponent(userNumber)}`);
    if (response.ok) setSelected(await response.json());
  };

  const editFromList = async (id) => {
    const response = await fetch(`${apiUrl}/api/meetings/${id}?user_number=${encodeURIComponent(userNumber)}`);
    if (response.ok) setEditingMeeting(await response.json());
  };

  const deleteFromList = async (meeting) => {
    if (!window.confirm(`Delete "${meeting.title}" permanently? This removes the full meeting entry, recording, transcript, and analysis.`)) return;
    const response = await fetch(`${apiUrl}/api/meetings/${meeting.id}?user_number=${encodeURIComponent(userNumber)}`, { method: 'DELETE' });
    if (!response.ok) window.alert('Could not delete this meeting.');
    else loadMeetings();
  };

  useEffect(() => { setPage(1); }, [search, status, userNumber]);
  useEffect(() => { const delay = window.setTimeout(loadMeetings, 250); return () => window.clearTimeout(delay); }, [search, status, userNumber, page, activeTab]);
  useEffect(() => {
    const hasProcessing = meetings.some((meeting) => ['queued', 'transcribing', 'analyzing'].includes(meeting.processing_status));
    if (!hasProcessing && !selected) return undefined;
    const interval = window.setInterval(() => { loadMeetings(); if (selected && selected.processing_status !== 'ready') loadDetail(selected.id); }, 4000);
    return () => window.clearInterval(interval);
  }, [meetings, selected?.id, selected?.processing_status]);

  if (selected) return <MeetingDetail meeting={selected} apiUrl={apiUrl} userNumber={userNumber} onBack={() => setSelected(null)} onChanged={loadDetail} onDeleted={() => { setSelected(null); loadMeetings(); }} />;

  return (
    <div className="mx-auto max-w-7xl p-5 lg:p-10">
      <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-semibold uppercase tracking-wider text-blue-600">Executive Memory</p><h1 className="mt-1 text-3xl font-semibold text-slate-950">Meetings</h1><p className="mt-2 text-slate-600">Every conversation, decision, and commitment—remembered.</p></div>{activeTab === 'meetings' && <button onClick={() => setShowAdd(true)} className="rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white shadow-sm hover:bg-blue-700">Add Meeting</button>}</div>
      <div className="mt-7 border-b border-slate-200"><div className="flex gap-6">{[['meetings', t('meetings.tabs.meetings')], ['tasks', t('meetings.tabs.tasks')]].map(([id, label]) => <button key={id} type="button" onClick={() => setActiveTab(id)} className={`relative px-2 pb-3 font-medium transition-colors ${activeTab === id ? 'text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}>{label}{activeTab === id && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />}</button>)}</div></div>
      {activeTab === 'tasks' ? <MeetingTasks apiUrl={apiUrl} userNumber={userNumber} /> : <>
      <div className="mt-6 flex flex-wrap gap-3 rounded-xl border border-slate-200 bg-white p-4"><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search meetings and transcripts" className="min-w-[240px] flex-1 rounded-lg border border-slate-300 px-3 py-2" /><select value={status} onChange={(event) => setStatus(event.target.value)} className="rounded-lg border border-slate-300 px-3 py-2"><option value="">All statuses</option><option value="processed">Processed</option><option value="ready">Ready to process</option><option value="queued">Queued</option><option value="transcribing">Transcribing</option><option value="analyzing">Analyzing</option><option value="failed">Needs attention</option></select></div>
      {error && <p className="mt-5 rounded-lg bg-red-50 p-4 text-red-700">{error}</p>}
      {loading ? <p className="mt-10 text-center text-slate-500">Loading meetings…</p> : meetings.length === 0 ? <div className="mt-10 rounded-2xl border-2 border-dashed border-slate-300 p-12 text-center"><h2 className="text-xl font-semibold">Alfred is ready for your first meeting</h2><p className="mt-2 text-slate-600">Record a conversation, upload audio, or paste your notes.</p><button onClick={() => setShowAdd(true)} className="mt-5 rounded-lg bg-blue-600 px-5 py-3 font-semibold text-white">Add your first meeting</button></div> : (
        <><div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white"><div className="hidden grid-cols-[2fr_1fr_1fr_100px_130px_110px] gap-4 border-b bg-slate-50 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 md:grid"><span>Meeting</span><span>Date</span><span>Participants</span><span>Items</span><span>Status</span><span>Actions</span></div>{meetings.map((meeting) => <div key={meeting.id} role="button" tabIndex={0} onClick={() => loadDetail(meeting.id)} onKeyDown={(event) => { if (event.key === 'Enter') loadDetail(meeting.id); }} className="flex w-full cursor-pointer items-center gap-3 border-b border-slate-100 p-3 text-left hover:bg-slate-50 md:grid md:grid-cols-[2fr_1fr_1fr_100px_130px_110px] md:p-5"><div className="min-w-0 flex-1"><p className="truncate font-semibold text-slate-900">{meeting.title}</p><p className="mt-1 hidden line-clamp-2 text-sm text-slate-500 md:block">{meeting.one_line_summary || 'Alfred is preparing this meeting…'}</p></div><p className="flex-none text-xs text-slate-600 md:text-sm">{formatDate(meeting.started_at)}</p><p className="hidden truncate text-sm text-slate-600 sm:block md:block">{meeting.participants.map((p) => p.display_name).join(', ') || '—'}</p><p className="hidden text-sm text-slate-600 md:block">{meeting.action_item_count} actions<br />{meeting.decision_count} decisions</p><span className={`hidden w-fit rounded-full px-3 py-1 text-xs font-semibold md:block ${meeting.status === 'processed' ? 'bg-emerald-100 text-emerald-800' : meeting.processing_status === 'ready' ? 'bg-amber-100 text-amber-800' : meeting.processing_status === 'failed' ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800'}`}>{meeting.status === 'processed' ? 'Processed' : meeting.processing_status === 'ready' ? 'Ready to process' : STATUS_LABELS[meeting.processing_status] || meeting.processing_status}</span><div className="hidden gap-3 text-sm font-semibold md:flex"><button onClick={(event) => { event.stopPropagation(); editFromList(meeting.id); }} className="text-blue-600 hover:underline">Edit</button><button onClick={(event) => { event.stopPropagation(); deleteFromList(meeting); }} className="text-red-600 hover:underline">Delete</button></div></div>)}</div><div className="mt-4 flex items-center justify-between gap-4"><p className="text-sm text-slate-500">{pagination.total} meeting{pagination.total === 1 ? '' : 's'} · Page {page} of {pagination.total_pages}</p><div className="flex gap-2"><button type="button" disabled={page === 1} onClick={() => setPage((value) => value - 1)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-40">Previous</button><button type="button" disabled={page >= pagination.total_pages} onClick={() => setPage((value) => value + 1)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-40">Next</button></div></div></>
      )}
      {showAdd && <AddMeetingModal apiUrl={apiUrl} userNumber={userNumber} onClose={() => setShowAdd(false)} onCreated={({ id }) => { setShowAdd(false); loadMeetings(); loadDetail(id); }} />}
      {editingMeeting && <EditMeetingModal meeting={editingMeeting} apiUrl={apiUrl} userNumber={userNumber} onClose={() => setEditingMeeting(null)} onSaved={() => { setEditingMeeting(null); loadMeetings(); }} />}
      </>}
    </div>
  );
}
