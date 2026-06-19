import { useMemo, useState } from 'react';
import { CALENDAR_MTN_FILTERS, getCalendarMtnLabel, getCalendarTasks } from '../../utils/todoCalendarLogic.js';
import { getMtnStyle } from '../../utils/taskHelpers.js';

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

function CalendarTaskCard({ task, goals, getTaskScore, onStartEdit }) {
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
    <button
      type="button"
      draggable
      onDragStart={handleDragStart}
      onClick={() => onStartEdit(task)}
      className="w-full rounded border border-slate-200 bg-white px-2 py-2 text-left shadow-sm transition hover:border-slate-300 hover:shadow"
    >
      <div className="flex items-start gap-1.5">
        {task.is_recurring && (
          <span className="mt-0.5 shrink-0 text-blue-600" title="Recurring task" aria-label="Recurring task">
            <RepeatIcon />
          </span>
        )}
        <span className="min-w-0 flex-1 text-sm font-medium leading-snug text-slate-800">
          {task.title}
        </span>
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
    </button>
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
          <span className="rounded bg-white px-1.5 py-0.5 text-xs font-medium text-slate-500">
            {tasks.length}
          </span>
        </div>
        <p className="mt-0.5 text-xs text-slate-500">{day.dateLabel}</p>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-2">
        {tasks.map(task => (
          <CalendarTaskCard
            key={task.id}
            task={task}
            goals={goals}
            getTaskScore={getTaskScore}
            onStartEdit={onStartEdit}
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

function OverdueSection({ tasks, goals, getTaskScore, onStartEdit }) {
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
          />
        ))}
      </div>
    </div>
  );
}

export function TodoViewToggle({ value, onChange }) {
  return (
    <div className="mb-4 inline-flex rounded border border-slate-200 bg-slate-100 p-1">
      {[
        { value: 'list', label: 'List View' },
        { value: 'calendar', label: 'Calendar View' },
      ].map(option => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${
            value === option.value
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
          aria-pressed={value === option.value}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export default function TodoCalendarView({
  activeTab,
  tasks,
  todayKey,
  goals,
  getTaskScore,
  onStartEdit,
  onReschedule,
}) {
  const [mtnFilter, setMtnFilter] = useState('focus');
  const [dropTarget, setDropTarget] = useState('');
  const { days, groupedTasks, overdueTasks } = useMemo(
    () => getCalendarTasks({ tasks, todayKey, mtnFilter, getTaskScore }),
    [tasks, todayKey, mtnFilter, getTaskScore]
  );

  if (activeTab !== 'tasks') return null;

  const visibleCount = overdueTasks.length + Object.values(groupedTasks).reduce((sum, dayTasks) => sum + dayTasks.length, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">7-day workplan</h2>
          <p className="mt-1 text-sm text-slate-500">{visibleCount} task(s) in view</p>
        </div>
        <label className="flex flex-col gap-1 text-sm font-medium text-slate-700 sm:min-w-72">
          MTN filter
          <select
            value={mtnFilter}
            onChange={(event) => setMtnFilter(event.target.value)}
            className="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
          >
            {CALENDAR_MTN_FILTERS.map(option => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
      </div>

      <OverdueSection
        tasks={overdueTasks}
        goals={goals}
        getTaskScore={getTaskScore}
        onStartEdit={onStartEdit}
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
            />
          ))}
        </div>
      </div>
    </div>
  );
}
