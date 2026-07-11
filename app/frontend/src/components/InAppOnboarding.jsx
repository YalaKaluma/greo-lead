import { useEffect, useRef, useState } from 'react';
import axios from 'axios';

export default function InAppOnboarding({ apiUrl, userNumber, onComplete }) {
  const [session, setSession] = useState(null);
  const [answer, setAnswer] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [finishedNow, setFinishedNow] = useState(false);
  const endRef = useRef(null);

  useEffect(() => {
    if (!userNumber) return;
    axios.get(`${apiUrl}/api/onboarding/in-app/session`, { params: { user_number: userNumber } })
      .then(({ data }) => {
        setSession(data);
        if (data.completed) onComplete?.();
      })
      .catch(() => setError('Alfred could not start setup. Please refresh and try again.'));
  }, [apiUrl, userNumber]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [session?.messages, sending]);

  const submit = async (event) => {
    event.preventDefault();
    const content = answer.trim();
    if (!content || sending) return;
    setAnswer('');
    setError('');
    setSending(true);
    setSession((current) => ({
      ...current,
      messages: [...(current?.messages || []), { role: 'user', content }]
    }));
    try {
      const { data } = await axios.post(`${apiUrl}/api/onboarding/in-app/respond`, {
        user_number: userNumber,
        answer: content
      });
      setSession(data);
      if (data.completed) {
        setFinishedNow(true);
      }
    } catch (requestError) {
      setError(requestError.response?.data?.detail || 'I could not save that answer. Please try again.');
    } finally {
      setSending(false);
    }
  };

  if (!session || (session.completed && !finishedNow)) return null;

  return (
    <div className="fixed inset-0 z-[70] flex bg-slate-950/60 p-0 backdrop-blur-sm md:items-center md:justify-center md:p-6">
      <section className="flex h-full w-full flex-col overflow-hidden bg-slate-50 shadow-2xl md:h-[min(760px,92vh)] md:max-w-3xl md:rounded-2xl">
        <header className="border-b border-slate-200 bg-white px-5 py-4 md:px-8">
          <div className="flex items-center gap-3">
            <img src="/alfred-logo.png" alt="Alfred" className="h-11 w-11 rounded-full border border-amber-300 object-cover" />
            <div>
              <h1 className="text-lg font-semibold text-slate-950">Set up Alfred</h1>
              <p className="text-sm text-slate-500">A quick conversation · Question {session.progress} of {session.total}</p>
            </div>
          </div>
          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-amber-400 transition-all" style={{ width: `${(session.progress / session.total) * 100}%` }} />
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-6 md:px-8">
          <div className="mx-auto max-w-2xl space-y-4">
            {(session.messages || []).map((message, index) => (
              <div key={`${message.role}-${index}`} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-6 md:text-base ${
                  message.role === 'user'
                    ? 'rounded-br-md bg-slate-950 text-white'
                    : 'rounded-bl-md border border-slate-200 bg-white text-slate-800 shadow-sm'
                }`}>
                  {message.content}
                </div>
              </div>
            ))}
            {sending && <p className="text-sm text-slate-500">Alfred is listening…</p>}
            <div ref={endRef} />
          </div>
        </div>

        <footer className="border-t border-slate-200 bg-white p-4 md:px-8 md:py-5">
          {session.completed ? (
            <div className="mx-auto flex max-w-2xl justify-end">
              <button type="button" onClick={() => onComplete?.()} className="rounded-xl bg-slate-950 px-6 py-3 font-semibold text-white hover:bg-slate-800">
                Enter Alfred
              </button>
            </div>
          ) : <form onSubmit={submit} className="mx-auto flex max-w-2xl items-end gap-3">
            <textarea
              autoFocus
              rows={2}
              value={answer}
              onChange={(event) => setAnswer(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  submit(event);
                }
              }}
              placeholder="Tell Alfred…"
              disabled={sending}
              className="min-h-[54px] flex-1 resize-none rounded-xl border border-slate-300 px-4 py-3 text-base focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-100"
            />
            <button type="submit" disabled={!answer.trim() || sending} className="h-[54px] rounded-xl bg-slate-950 px-6 font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300">
              Send
            </button>
          </form>}
          {error && <p className="mx-auto mt-2 max-w-2xl text-sm text-rose-600">{error}</p>}
        </footer>
      </section>
    </div>
  );
}
