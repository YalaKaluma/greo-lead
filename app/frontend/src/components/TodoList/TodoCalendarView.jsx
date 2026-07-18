import { useEffect, useMemo, useState } from 'react';
import { getCalendarMtnLabel, getCalendarTasks, summarizeCalendarDay } from '../../utils/todoCalendarLogic.js';
import { getMtnStyle } from '../../utils/taskHelpers.js';
import { formatShortDate } from '../../utils/todoDateLogic.js';

function RepeatIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m17 2 4 4-4 4" />
      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
      <path d="m7 22-4-4 4-4" />
      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </svg>
  );
}

function CalendarTaskCard({
  task,
  goals,
  getTaskScore,
  onStartEdit,
  onOpenDoLater,
  t,
  selectionMode,
  isSelected,
  onEnterSelection,
  onSelectToggle,
}) {
  const mtnLabel = getCalendarMtnLabel(task, getTaskScore);
  const goalLabel =
    goals.find(goal => goal.id === task.goal_id)?.title ||
    goals.find(goal => goal.id === task.goal_id)?.goal_text ||
    task.goal_title ||
    '';

  const handleDragStart = (event) => {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', String(task.id));
  };

  return (
    <div
      draggable={!selectionMode}
      onDragStart={handleDragStart}
      className={`w-full rounded border px-2 py-2 text-left shadow-sm transition hover:shadow ${
        isSelected ? 'border-blue-500 bg-blue-50' : 'border-slate-200 bg-white hover:border-slate-300'
      }`}
    >
      <div className="flex items-start gap-1.5">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            if (selectionMode) onSelectToggle(task.id);
            else onEnterSelection(task.id);
          }}
          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px] font-bold ${
            isSelected ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 bg-white text-transparent hover:border-blue-500'
          }`}
          aria-label={isSelected ? t('calendar.deselectTask', 'Deselect task') : t('calendar.selectTask', 'Select task')}
          aria-pressed={isSelected}
        >
          ✓
        </button>
        <button
          type="button"
          onClick={() => selectionMode ? onSelectToggle(task.id) : onStartEdit(task)}
          className="flex min-w-0 flex-1 items-start gap-1.5 text-left"
        >
        {task.is_recurring && (
          <span className="mt-0.5 shrink-0 text-blue-600" title="Recurring task" aria-label="Recurring task">
            <RepeatIcon />
          </span>
        )}
        <span className="min-w-0 flex-1 text-sm font-medium leading-snug text-slate-800">
          {task.title}
        </span>
        </button>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {mtnLabel ? (
          <span className={`max-w-full truncate rounded border px-1.5 py-0.5 text-[11px] font-medium ${getMtnStyle(mtnLabel)}`}>
            {mtnLabel}
          </span>
        ) : (
          <span className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[11px] font-medium text-slate-500">
            No MTN
          </span>
        )}
        {goalLabel && (
          <span className="max-w-full truncate rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">
            {goalLabel}
          </span>
        )}
        {task.estimated_effort && (
          <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[11px] font-medium text-indigo-700">
            {task.estimated_effort}
          </span>
        )}
        {task.delegated_to && (
          <span className="max-w-full truncate rounded bg-cyan-50 px-1.5 py-0.5 text-[11px] font-medium text-cyan-700">
            {task.delegated_to}
          </span>
        )}
      </div>
      {!selectionMode && (
        <button
          type="button"
          onClick={() => onOpenDoLater(task)}
          className="mt-2 w-full rounded border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100"
        >
          {t('calendar.doLater', 'Do later')}
        </button>
      )}
    </div>
  );
}

function TodoCalendarDayColumn({
  day,
  tasks,
  allTasks,
  goals,
  getTaskScore,
  onStartEdit,
  onReschedule,
  isDropTarget,
  setDropTarget,
  summary,
  t,
  onOpenDoLater,
  selectionMode,
  selectedTasks,
  onEnterSelection,
  onSelectToggle,
}) {
  const handleDragOver = (event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setDropTarget(day.key);
  };

  const handleDrop = (event) => {
    event.preventDefault();
    setDropTarget('');
    const taskId = Number(event.dataTransfer.getData('text/plain'));
    const task = allTasks.find(item => item.id === taskId);
    if (task) onReschedule(task, day.key);
  };

  return (
    <section
      aria-label={`${day.label} ${day.dateLabel}`}
      onDragOver={handleDragOver}
      onDragLeave={() => setDropTarget('')}
      onDrop={handleDrop}
      className={`flex min-h-[22rem] min-w-[11rem] flex-1 flex-col rounded border bg-slate-50 transition-colors ${
        isDropTarget ? 'border-blue-300 bg-blue-50' : 'border-slate-200'
      }`}
    >
      <div className="border-b border-slate-200 px-3 py-2">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-900">{day.label}</h3>
          <span className={`rounded border px-1.5 py-0.5 text-[11px] font-semibold ${{
            light: 'border-slate-200 bg-white text-slate-600',
            balanced: 'border-emerald-200 bg-emerald-50 text-emerald-700',
            heavy: 'border-amber-200 bg-amber-50 text-amber-700',
            overloaded: 'border-red-200 bg-red-50 text-red-700',
            unknown: 'border-slate-200 bg-slate-100 text-slate-600',
          }[summary.status]}`}>
            {t(`calendar.status.${summary.status}`, summary.status)}
          </span>
        </div>
        <p className="mt-0.5 text-xs text-slate-500">{day.dateLabel}</p>
        <dl className="mt-2 space-y-1 text-xs" aria-label={t('calendar.dailySummary', 'Daily planning summary')}>
          <div className="flex items-center justify-between gap-2">
            <dt className="text-slate-500">{t('calendar.expectedMtn', 'Expected MTN')}</dt>
            <dd className="font-semibold text-slate-900">{summary.expectedMtn.toFixed(1)}</dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="text-slate-500">{t('calendar.tasks', 'Tasks')}</dt>
            <dd className="font-medium text-slate-700">{summary.taskCount}</dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="text-slate-500">{t('calendar.averageMtn', 'Average MTN')}</dt>
            <dd className="font-medium text-slate-700">{summary.averageMtn === null ? '—' : summary.averageMtn.toFixed(1)}</dd>
          </div>
        </dl>
        {summary.missingScoreCount > 0 && (
          <p className="mt-1 text-[11px] text-slate-500">
            {summary.missingScoreCount} {t('calendar.missingMtn', 'without an MTN score')}
          </p>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-2">
        {tasks.map(task => (
          <CalendarTaskCard
            key={task.id}
            task={task}
            goals={goals}
            getTaskScore={getTaskScore}
            onStartEdit={onStartEdit}
            onOpenDoLater={onOpenDoLater}
            t={t}
            selectionMode={selectionMode}
            isSelected={selectedTasks.includes(task.id)}
            onEnterSelection={onEnterSelection}
            onSelectToggle={onSelectToggle}
          />
        ))}
        {tasks.length === 0 && (
          <div className="flex flex-1 items-center justify-center rounded border border-dashed border-slate-200 px-2 text-center text-xs text-slate-400">
            Drop task here
          </div>
        )}
      </div>
    </section>
  );
}

function OverdueSection({
  tasks,
  goals,
  getTaskScore,
  onStartEdit,
  onOpenDoLater,
  t,
  selectionMode,
  selectedTasks,
  onEnterSelection,
  onSelectToggle,
}) {
  if (tasks.length === 0) return null;

  return (
    <div className="mb-4 rounded border border-red-200 bg-red-50 p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-red-900">Overdue</h3>
        <span className="text-xs font-medium text-red-700">{tasks.length} task(s)</span>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {tasks.map(task => (
          <CalendarTaskCard
            key={task.id}
            task={task}
            goals={goals}
            getTaskScore={getTaskScore}
            onStartEdit={onStartEdit}
            onOpenDoLater={onOpenDoLater}
            t={t}
            selectionMode={selectionMode}
            isSelected={selectedTasks.includes(task.id)}
            onEnterSelection={onEnterSelection}
            onSelectToggle={onSelectToggle}
          />
        ))}
      </div>
    </div>
  );
}

export function DoLaterDialog({ task, onClose, onSchedule, t }) {
  const [showDueDate, setShowDueDate] = useState(false);
  const [dueDate, setDueDate] = useState(task?.due_date?.split?.('T')?.[0] || '');
  const [saving, setSaving] = useState(false);

  const schedule = async (period, selectedDueDate = null) => {
    setSaving(true);
    const result = await onSchedule(task, period, selectedDueDate);
    setSaving(false);
    if (result) onClose(result);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="do-later-title">
      <div className="w-full max-w-sm rounded-lg bg-white p-4 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="do-later-title" className="text-base font-semibold text-slate-900">{t('calendar.doLater', 'Do later')}</h2>
            <p className="mt-1 text-sm text-slate-600">{task.title}</p>
          </div>
          <button type="button" onClick={() => onClose(null)} className="text-xl text-slate-400 hover:text-slate-700" aria-label={t('common.close', 'Close')}>×</button>
        </div>

        {!showDueDate ? (
          <div className="mt-4 grid gap-2">
            <button type="button" disabled={saving} onClick={() => schedule('later_this_week')} className="rounded border border-slate-200 px-3 py-2 text-left text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50">
              {t('calendar.laterThisWeek', 'Later this week')}
            </button>
            <button type="button" disabled={saving} onClick={() => schedule('next_week')} className="rounded border border-slate-200 px-3 py-2 text-left text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50">
              {t('calendar.nextWeek', 'Next week')}
            </button>
            <button type="button" disabled={saving} onClick={() => setShowDueDate(true)} className="rounded border border-slate-200 px-3 py-2 text-left text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50">
              {t('calendar.enterDueDate', 'Enter due date')}
            </button>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <label className="block text-sm font-medium text-slate-700" htmlFor="do-later-due-date">{t('calendar.dueDate', 'Due date')}</label>
            <input id="do-later-due-date" type="date" value={dueDate} onChange={event => setDueDate(event.target.value)} className="w-full rounded border border-slate-300 px-3 py-2" />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowDueDate(false)} className="rounded px-3 py-2 text-sm text-slate-600 hover:bg-slate-100">{t('common.back', 'Back')}</button>
              <button type="button" disabled={!dueDate || saving} onClick={() => schedule('by_due_date', dueDate)} className="rounded bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
                {saving ? t('common.saving', 'Saving…') : t('calendar.scheduleTask', 'Schedule task')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function TodoCalendarView({
  activeTab,
  tasks,
  todayKey,
  selectedMtnTags,
  searchQuery,
  goals,
  getTaskScore,
  onStartEdit,
  onReschedule,
  onDoLater = async () => null,
  onUndoDoLater = async () => false,
  selectionMode = false,
  selectedTasks = [],
  onEnterSelection = () => {},
  onSelectToggle = () => {},
  mtnCapacity = null,
  t = (key, fallback) => fallback || key,
}) {
  const [dropTarget, setDropTarget] = useState('');
  const [doLaterTask, setDoLaterTask] = useState(null);
  const [undoMove, setUndoMove] = useState(null);
  const { days, groupedTasks, allGroupedTasks, overdueTasks } = useMemo(
    () => getCalendarTasks({ tasks, todayKey, selectedMtnTags, searchQuery, getTaskScore }),
    [tasks, todayKey, selectedMtnTags, searchQuery, getTaskScore]
  );

  useEffect(() => {
    if (!undoMove) return undefined;
    const timer = setTimeout(() => setUndoMove(null), 8000);
    return () => clearTimeout(timer);
  }, [undoMove]);

  if (activeTab !== 'calendar') return null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-200 bg-white px-3 py-2">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">{t('calendar.sevenDayPlan', 'Seven-day plan')}</h2>
          <p className="text-xs text-slate-500">{t('calendar.capacityHelp', 'Capacity starts at 25 and rises when your average achieved daily MTN over the previous 3 weeks is higher.')}</p>
        </div>
        <span className="rounded bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
          {t('calendar.dailyCapacity', 'Daily capacity')}: {mtnCapacity === null ? '—' : mtnCapacity.toFixed(1)}
        </span>
      </div>
      <OverdueSection
        tasks={overdueTasks}
        goals={goals}
        getTaskScore={getTaskScore}
        onStartEdit={onStartEdit}
        onOpenDoLater={setDoLaterTask}
        t={t}
        selectionMode={selectionMode}
        selectedTasks={selectedTasks}
        onEnterSelection={onEnterSelection}
        onSelectToggle={onSelectToggle}
      />

      <div className="overflow-x-auto pb-2">
        <div className="flex min-w-[72rem] gap-3">
          {days.map(day => (
            <TodoCalendarDayColumn
              key={day.key}
              day={day}
              tasks={groupedTasks[day.key] || []}
              allTasks={tasks}
              goals={goals}
              getTaskScore={getTaskScore}
              onStartEdit={onStartEdit}
              onReschedule={onReschedule}
              isDropTarget={dropTarget === day.key}
              setDropTarget={setDropTarget}
              summary={summarizeCalendarDay(allGroupedTasks[day.key] || [], mtnCapacity, getTaskScore)}
              t={t}
              onOpenDoLater={setDoLaterTask}
              selectionMode={selectionMode}
              selectedTasks={selectedTasks}
              onEnterSelection={onEnterSelection}
              onSelectToggle={onSelectToggle}
            />
          ))}
        </div>
      </div>
      {doLaterTask && (
        <DoLaterDialog
          key={doLaterTask.id}
          task={doLaterTask}
          t={t}
          onSchedule={onDoLater}
          onClose={(result) => {
            setDoLaterTask(null);
            if (result) setUndoMove(result);
          }}
        />
      )}
      {undoMove && (
        <div className="fixed bottom-5 right-5 z-50 flex items-center gap-3 rounded-lg bg-slate-900 px-4 py-3 text-sm text-white shadow-xl" role="status">
          <span>{t('calendar.movedTo', 'Task moved to')} {formatShortDate(undoMove.targetDate)}</span>
          <button
            type="button"
            className="font-semibold text-blue-300 hover:text-blue-200"
            onClick={async () => {
              const restored = await onUndoDoLater(undoMove);
              if (restored) setUndoMove(null);
            }}
          >
            {t('common.undo', 'Undo')}
          </button>
          <button type="button" onClick={() => setUndoMove(null)} className="text-slate-400 hover:text-white" aria-label={t('common.close', 'Close')}>×</button>
        </div>
      )}
    </div>
  );
}
