import { useEffect, useState } from 'react';


export const OUTCOME_STATUS_OPTIONS = [
  { value: 'not_started', key: 'goals.outcomeStatus.notStarted' },
  { value: 'done', key: 'goals.outcomeStatus.done' },
  { value: 'ongoing', key: 'goals.outcomeStatus.ongoing' },
  { value: 'at_risk', key: 'goals.outcomeStatus.atRisk' },
  { value: 'blocked', key: 'goals.outcomeStatus.blocked' },
];

export default function OutcomeEditModal({
  outcome,
  status = 'not_started',
  onClose,
  onSave,
  onRemove,
  saving = false,
  t = key => key,
}) {
  const [form, setForm] = useState({ title: '', goal_text: '', status: 'not_started' });

  useEffect(() => {
    setForm({
      title: outcome?.title || '',
      goal_text: outcome?.goal_text || '',
      status: status || 'not_started',
    });
  }, [outcome, status]);

  if (!outcome) return null;

  const submit = (event) => {
    event.preventDefault();
    if (!form.title.trim() || saving) return;
    onSave({
      title: form.title.trim(),
      goal_text: form.goal_text.trim() || form.title.trim(),
      status: form.status,
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="outcome-editor-title"
      onClick={(event) => {
        if (event.target === event.currentTarget && !saving) onClose();
      }}
    >
      <form onSubmit={submit} className="flex max-h-[90vh] w-full max-w-xl flex-col rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h3 id="outcome-editor-title" className="text-xl font-semibold text-slate-800">
            {t('goals.editOutcome')}
          </h3>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="p-1 text-slate-400 transition-colors hover:text-slate-600 disabled:opacity-50"
            aria-label={t('common.close')}
          >
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto p-6">
          <label className="block text-sm font-medium text-slate-700">
            {t('goals.outcomeTitle')}
            <input
              value={form.title}
              onChange={(event) => setForm(previous => ({ ...previous, title: event.target.value }))}
              className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            {t('goals.outcomeDescription')}
            <textarea
              value={form.goal_text}
              onChange={(event) => setForm(previous => ({ ...previous, goal_text: event.target.value }))}
              rows={4}
              className="mt-2 w-full resize-none rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            {t('goals.outcomeStatus')}
            <select
              value={form.status}
              onChange={(event) => setForm(previous => ({ ...previous, status: event.target.value }))}
              className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2"
            >
              {OUTCOME_STATUS_OPTIONS.map(option => (
                <option key={option.value} value={option.value}>{t(option.key)}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex gap-3 border-t border-slate-200 px-6 py-4">
          <button type="button" onClick={onClose} disabled={saving} className="flex-1 rounded-lg border-2 border-slate-300 px-4 py-3 font-medium text-slate-700 disabled:opacity-50">
            {t('common.cancel')}
          </button>
          <button type="submit" disabled={saving || !form.title.trim()} className="flex-1 rounded-lg bg-blue-600 px-4 py-3 font-medium text-white disabled:opacity-50">
            {saving ? t('common.saving') : t('goals.saveOutcome')}
          </button>
        </div>
        {onRemove && (
          <div className="px-6 pb-4">
            <button type="button" onClick={onRemove} disabled={saving} className="w-full rounded-lg border border-red-200 bg-red-50 px-4 py-3 font-medium text-red-600 disabled:opacity-50">
              {t('goals.removeOutcomeFromWave')}
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
