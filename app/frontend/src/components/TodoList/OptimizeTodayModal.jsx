import { useMemo, useState } from 'react';
import { findSuitableScheduleDate, getExpectedMtnScore, getTaskScheduledDate } from '../../utils/todoCalendarLogic.js';
import { formatShortDate } from '../../utils/todoDateLogic.js';

export default function OptimizeTodayModal({
  tasks,
  todayKey,
  capacity,
  getTaskScore,
  loading,
  onCancel,
  onApply,
  t = (key, fallback) => fallback || key,
}) {
  const candidates = useMemo(() => tasks
    .map((task, index) => ({ task, index, score: getExpectedMtnScore(task, getTaskScore) }))
    .filter(({ task }) => String(task.status || 'open').toLowerCase() !== 'completed' && getTaskScheduledDate(task) === todayKey)
    .sort((left, right) => {
      if (left.score === null && right.score !== null) return 1;
      if (left.score !== null && right.score === null) return -1;
      if (left.score !== right.score) return (left.score ?? 0) - (right.score ?? 0);
      return right.index - left.index;
    }), [tasks, todayKey, getTaskScore]);

  const [decisions, setDecisions] = useState([]);
  const [conversation, setConversation] = useState(null);
  const [showDueDate, setShowDueDate] = useState(false);
  const [dueDate, setDueDate] = useState('');
  const requiredMoves = Math.max(candidates.length - 10, 0);
  const moves = decisions.filter(decision => decision.action === 'move');
  const decidedIds = new Set(decisions.map(decision => decision.task.id));
  const current = candidates.find(candidate => !decidedIds.has(candidate.task.id));
  const projectedTodayCount = candidates.length - moves.length;
  const reviewReady = moves.length >= requiredMoves || !current;

  const projectedTasks = tasks.map(task => {
    const move = moves.find(decision => decision.task.id === task.id);
    return move ? { ...task, scheduled_date: move.targetDate, due_date: move.newDueDate || task.due_date } : task;
  });

  const addMove = (targetDate, newDueDate = null) => {
    setDecisions(previous => [...previous, {
      action: 'move',
      task: current.task,
      targetDate,
      newDueDate,
    }]);
    setConversation(null);
    setShowDueDate(false);
    setDueDate('');
  };

  const evaluateMove = (period, selectedDueDate = null) => {
    const targetDate = findSuitableScheduleDate({
      tasks: projectedTasks,
      task: current.task,
      todayKey,
      period,
      dueDate: selectedDueDate,
      capacity,
      getTaskScore,
    });
    if (targetDate) {
      addMove(targetDate, selectedDueDate);
      return;
    }

    const nextPeriod = period === 'later_this_week' ? 'next_week' : period;
    const nextWeekTarget = findSuitableScheduleDate({
      tasks: projectedTasks,
      task: current.task,
      todayKey,
      period: nextPeriod,
      dueDate: selectedDueDate,
      capacity,
      getTaskScore,
    });
    if (nextWeekTarget) {
      setConversation({ type: 'next_week', targetDate: nextWeekTarget, newDueDate: selectedDueDate });
      setShowDueDate(false);
      return;
    }

    const pastDueTarget = findSuitableScheduleDate({
      tasks: projectedTasks,
      task: current.task,
      todayKey,
      period: nextPeriod,
      capacity,
      ignoreDeadline: true,
      getTaskScore,
    });
    if (pastDueTarget && current.task.due_date) {
      setConversation({
        type: 'deadline',
        targetDate: pastDueTarget,
        dueDate: String(current.task.due_date).split('T')[0],
      });
      setShowDueDate(false);
      return;
    }

    setConversation({ type: 'no_capacity' });
    setShowDueDate(false);
  };

  const keepToday = () => {
    setDecisions(previous => [...previous, { action: 'keep', task: current.task }]);
    setConversation(null);
    setShowDueDate(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 py-6" role="dialog" aria-modal="true" aria-labelledby="optimize-today-title">
      <div className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        <div className="border-b border-slate-200 px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id="optimize-today-title" className="text-lg font-semibold text-slate-900">{t('optimizeToday.title', 'Optimize Today')}</h2>
              <p className="mt-1 text-sm text-slate-600">{projectedTodayCount} {t('optimizeToday.tasksRemain', 'tasks projected to remain today')} · {t('optimizeToday.target', 'target')}: 10</p>
            </div>
            <button type="button" onClick={onCancel} disabled={loading} className="text-xl text-slate-400 hover:text-slate-700" aria-label={t('common.close', 'Close')}>×</button>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${requiredMoves ? Math.min((moves.length / requiredMoves) * 100, 100) : 100}%` }} />
          </div>
        </div>

        <div className="overflow-y-auto p-5">
          {requiredMoves === 0 ? (
            <p className="rounded-lg bg-emerald-50 p-4 text-sm text-emerald-800">{t('optimizeToday.alreadyOptimized', 'Today already has 10 or fewer scheduled tasks.')}</p>
          ) : reviewReady ? (
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold text-slate-900">{t('optimizeToday.review', 'Review proposed changes')}</h3>
                <p className="mt-1 text-sm text-slate-600">
                  {moves.length >= requiredMoves
                    ? t('optimizeToday.targetReached', 'The projected plan reaches 10 tasks for today.')
                    : t('optimizeToday.targetNotReached', 'All candidates were reviewed, but more than 10 tasks remain today.')}
                </p>
              </div>
              <div className="space-y-2">
                {moves.map(move => (
                  <div key={move.task.id} className="rounded-lg border border-slate-200 p-3">
                    <p className="text-sm font-medium text-slate-900">{move.task.title}</p>
                    <p className="mt-1 text-xs text-slate-600">{t('optimizeToday.moveTo', 'Move to')} {formatShortDate(move.targetDate)}{move.newDueDate ? ` · ${t('calendar.dueDate', 'Due date')}: ${formatShortDate(move.newDueDate)}` : ''}</p>
                  </div>
                ))}
                {moves.length === 0 && <p className="text-sm text-slate-500">{t('optimizeToday.noMoves', 'No task movements were selected.')}</p>}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-lg border border-slate-200 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t('optimizeToday.considering', 'Alfred is considering')}</p>
                    <h3 className="mt-1 font-semibold text-slate-900">{current.task.title}</h3>
                  </div>
                  <span className="rounded bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
                    {current.score === null ? t('optimizeToday.mtnUnavailable', 'MTN unavailable') : `MTN ${current.score.toFixed(1)}`}
                  </span>
                </div>
                {current.task.due_date && <p className="mt-2 text-xs text-slate-600">{t('calendar.currentDueDate', 'Current due date')}: {formatShortDate(current.task.due_date)}</p>}
              </div>

              {conversation ? (
                <div className="rounded-lg border border-blue-100 bg-blue-50 p-4 text-sm text-slate-700">
                  {conversation.type === 'next_week' && <p>{t('optimizeToday.noRoomThisWeek', 'There is no capacity on the remaining workdays this week. Alfred recommends')} <strong>{formatShortDate(conversation.targetDate)}</strong>.</p>}
                  {conversation.type === 'deadline' && <p>{t('calendar.deadlineConflict', 'The next capacity-safe workday is after the current due date.')} {formatShortDate(conversation.dueDate)} → <strong>{formatShortDate(conversation.targetDate)}</strong>.</p>}
                  {conversation.type === 'no_capacity' && <p>{t('calendar.noCapacityFound', 'Alfred could not find a capacity-safe workday in that period.')}</p>}
                  <div className="mt-3 flex flex-wrap justify-end gap-2">
                    <button type="button" onClick={() => setConversation(null)} className="rounded px-3 py-2 text-slate-600 hover:bg-white">{t('common.back', 'Back')}</button>
                    {conversation.type === 'deadline' && <button type="button" onClick={() => { setDueDate(''); setShowDueDate(true); setConversation(null); }} className="rounded border border-blue-200 bg-white px-3 py-2 font-medium text-blue-700">{t('calendar.chooseNewDueDate', 'Choose new due date')}</button>}
                    {(conversation.type === 'next_week' || conversation.type === 'deadline') && <button type="button" onClick={() => addMove(conversation.targetDate, conversation.type === 'deadline' ? conversation.targetDate : conversation.newDueDate)} className="rounded bg-blue-600 px-3 py-2 font-semibold text-white">{conversation.type === 'deadline' ? t('calendar.confirmPastDueDate', 'Move and update due date') : t('optimizeToday.acceptDate', 'Accept proposed date')}</button>}
                  </div>
                </div>
              ) : showDueDate ? (
                <div className="space-y-3 rounded-lg border border-slate-200 p-4">
                  <label htmlFor="optimize-due-date" className="block text-sm font-medium text-slate-700">{t('calendar.dueDate', 'Due date')}</label>
                  <input id="optimize-due-date" type="date" value={dueDate} onChange={event => setDueDate(event.target.value)} className="w-full rounded border border-slate-300 px-3 py-2" />
                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={() => setShowDueDate(false)} className="rounded px-3 py-2 text-sm text-slate-600">{t('common.back', 'Back')}</button>
                    <button type="button" disabled={!dueDate} onClick={() => evaluateMove('by_due_date', dueDate)} className="rounded bg-blue-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">{t('calendar.scheduleTask', 'Schedule task')}</button>
                  </div>
                </div>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  <button type="button" onClick={() => evaluateMove('later_this_week')} className="rounded border border-slate-200 px-3 py-2 text-left text-sm font-medium hover:bg-slate-50">{t('calendar.laterThisWeek', 'Later this week')}</button>
                  <button type="button" onClick={() => evaluateMove('next_week')} className="rounded border border-slate-200 px-3 py-2 text-left text-sm font-medium hover:bg-slate-50">{t('calendar.nextWeek', 'Next week')}</button>
                  <button type="button" onClick={() => setShowDueDate(true)} className="rounded border border-slate-200 px-3 py-2 text-left text-sm font-medium hover:bg-slate-50">{t('calendar.enterDueDate', 'Enter due date')}</button>
                  <button type="button" onClick={keepToday} className="rounded border border-slate-300 px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-100">{t('optimizeToday.keepToday', 'Keep today')}</button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-5 py-3">
          <span className="text-xs text-slate-500">{decisions.length} {t('optimizeToday.decisionsReviewed', 'decisions reviewed')}</span>
          <div className="flex gap-2">
            <button type="button" onClick={onCancel} disabled={loading} className="rounded border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 disabled:opacity-50">{t('common.cancel', 'Cancel')}</button>
            {reviewReady && moves.length > 0 && <button type="button" onClick={() => onApply(moves)} disabled={loading} className="rounded bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{loading ? t('common.saving', 'Saving…') : t('optimizeToday.apply', 'Apply selected changes')}</button>}
          </div>
        </div>
      </div>
    </div>
  );
}
