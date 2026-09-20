import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useLanguage } from '../i18n/LanguageContext';


export default function MyEmails({ apiUrl, userNumber }) {
  const { t } = useLanguage();
  const [context, setContext] = useState('');
  const [messages, setMessages] = useState([]);
  const [isDrafting, setIsDrafting] = useState(false);
  const [error, setError] = useState('');
  const [copiedId, setCopiedId] = useState(null);

  const loadHistory = async () => {
    try {
      const response = await axios.get(`${apiUrl}/api/chat/history`, {
        params: { user_number: userNumber, limit: 100, conversation_type: 'email' }
      });
      setMessages(response.data.messages || []);
    } catch {
      setMessages([]);
    }
  };

  useEffect(() => {
    if (userNumber) loadHistory();
  }, [userNumber]);

  const handleDraft = async (event) => {
    event.preventDefault();
    const trimmed = context.trim();
    if (!trimmed || isDrafting) return;
    setIsDrafting(true);
    setError('');
    try {
      await axios.post(`${apiUrl}/api/emails/draft`, {
        user_number: userNumber,
        context: trimmed,
      });
      setContext('');
      await loadHistory();
    } catch {
      setError(t('emails.error'));
    } finally {
      setIsDrafting(false);
    }
  };

  const exchanges = [];
  for (let index = 0; index < messages.length; index += 1) {
    if (messages[index].role !== 'user') continue;
    const draft = messages.slice(index + 1).find((message) => message.role === 'assistant');
    if (draft) exchanges.push({ request: messages[index], draft });
  }

  const copyDraft = async (draft) => {
    await navigator.clipboard.writeText(draft.content);
    setCopiedId(draft.message_id);
    window.setTimeout(() => setCopiedId(null), 1600);
  };

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6 lg:p-8">
      <header className="mb-6">
        <h1 className="text-3xl font-bold text-slate-900">{t('emails.title')}</h1>
        <p className="mt-2 max-w-3xl text-slate-600">{t('emails.subtitle')}</p>
      </header>

      <form onSubmit={handleDraft} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <label htmlFor="email-context" className="block text-sm font-semibold text-slate-800">
          {t('emails.contextLabel')}
        </label>
        <textarea
          id="email-context"
          value={context}
          onChange={(event) => setContext(event.target.value)}
          placeholder={t('emails.contextPlaceholder')}
          rows={7}
          className="mt-3 w-full resize-y rounded-xl border border-slate-300 p-4 text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        />
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        <div className="mt-4 flex justify-end">
          <button
            type="submit"
            disabled={!context.trim() || isDrafting}
            className="rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isDrafting ? t('emails.drafting') : t('emails.draft')}
          </button>
        </div>
      </form>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-slate-900">{t('emails.history')}</h2>
        {exchanges.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-500">{t('emails.empty')}</p>
        ) : (
          <div className="mt-4 space-y-5">
            {[...exchanges].reverse().map(({ request, draft }) => (
              <article key={draft.message_id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-100 bg-slate-50 px-5 py-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('emails.request')}</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{request.content}</p>
                </div>
                <div className="p-5">
                  <div className="flex justify-end">
                    <button type="button" onClick={() => copyDraft(draft)} className="text-sm font-semibold text-blue-600 hover:text-blue-800">
                      {copiedId === draft.message_id ? t('emails.copied') : t('emails.copy')}
                    </button>
                  </div>
                  <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-900">{draft.content}</div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
