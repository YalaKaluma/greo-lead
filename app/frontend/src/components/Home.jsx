import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { formatDueDate, getTodayET } from '../utils/taskHelpers';
import { useLanguage } from '../i18n/LanguageContext';
import KpiInfoButton from './KpiInfoButton';

const emptyStateActions = [
  { label: 'Create your first goal', page: 'my-goals' },
  { label: 'Add your first task', page: 'todo-list' },
  { label: 'Track your first habit', page: 'my-habits' },
  { label: 'Write your first journal entry', page: 'my-journal' },
  { label: 'Start your first leadership trial', page: 'my-journey' },
];

const toNumber = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, value));

const scoreDelta = (value) => {
  const number = toNumber(value, 0);
  if (number > 0) return `+${number.toFixed(1)}`;
  if (number < 0) return number.toFixed(1);
  return '0.0';
};

const pointDelta = (value) => {
  const number = toNumber(value, 0);
  if (number > 0) return `+${Math.round(number)} pts`;
  if (number < 0) return `${Math.round(number)} pts`;
  return '0 pts';
};

const goalHealthStyles = {
  green: {
    accent: 'border-l-emerald-500',
  },
  amber: {
    accent: 'border-l-amber-500',
  },
  red: {
    accent: 'border-l-rose-500',
  },
};

function CardHeader({ title }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
  );
}

const GAUGE_SEGMENTS = ['#dc2626', '#f97316', '#facc15', '#65a30d', '#16a34a'];

function SegmentedGauge({ value, benchmark, valueLabel, t }) {
  const numericValue = Math.max(0, toNumber(value, 0));
  const numericBenchmark = Math.max(0, toNumber(benchmark, 0));
  const position = numericBenchmark > 0
    ? clamp((numericValue / numericBenchmark) * 50, 3, 97)
    : 50;
  const description = `${valueLabel}. ${t('home.gauge.fiveWeekAverage', 'Five-week average')}: ${numericBenchmark.toFixed(1)}`;
  return (
    <div className="w-full" role="img" aria-label={description} title={description}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-3xl font-semibold text-slate-950">{valueLabel}</span>
        <span className="text-xs font-medium text-slate-500">{t('home.gauge.midpoint', 'Midpoint')}: {numericBenchmark.toFixed(1)}</span>
      </div>
      <div className="relative mt-3 h-9 px-[3%]">
        <div className="absolute inset-x-[3%] top-3 flex h-3 overflow-hidden rounded-full border border-slate-200 bg-slate-100">
          {GAUGE_SEGMENTS.map((color) => <span key={color} className="flex-1" style={{ backgroundColor: color }} />)}
        </div>
        <div className="absolute top-0 h-8 w-1 rounded-full bg-slate-900 shadow-sm" style={{ left: `${position}%` }}>
          <span className="absolute -left-[5px] -top-1 h-0 w-0 border-l-[7px] border-r-[7px] border-t-[8px] border-l-transparent border-r-transparent border-t-slate-900" />
        </div>
      </div>
      <p className="mt-1 text-center text-[11px] font-medium text-slate-500">{t('home.gauge.fiveWeekAverage', 'Five-week average')} - {t('home.gauge.centered', 'centered on the gauge')}</p>
    </div>
  );
}

function MtnScoreCard({ metric, t }) {
  const delta = scoreDelta(metric?.delta);
  return (
    <section className="relative rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <KpiInfoButton label="About the Move-the-needle Index">
        The 7-day average MTN score from completed tasks. It is compared with the 30-day average to show whether execution momentum is improving.
      </KpiInfoButton>
      <CardHeader title="Move-the-needle Index" />
      <div className="mt-4">
        <SegmentedGauge value={metric?.score} benchmark={metric?.five_week_average} valueLabel={toNumber(metric?.score, 0).toFixed(1)} t={t} />
        <div className="mt-3 flex flex-wrap justify-between gap-2">
          <p className="text-sm text-slate-600">{toNumber(metric?.average_tasks_per_day, 0).toFixed(1)} tasks completed / day</p>
          <p className={`mt-3 text-sm font-semibold ${delta.startsWith('-') ? 'text-rose-700' : 'text-emerald-700'}`}>
            {delta} vs month average
          </p>
        </div>
      </div>
    </section>
  );
}

function HabitsMetricCard({ metric, t }) {
  const delta = pointDelta(metric?.delta);
  return (
    <section className="relative rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <KpiInfoButton label="About the Balance Index">
        The share of planned habits completed in the last 7 days. It is compared with the 90-day habit baseline to show habit balance.
      </KpiInfoButton>
      <CardHeader title="Balance Index" />
      <div className="mt-4">
        <SegmentedGauge value={metric?.compliance_rate} benchmark={metric?.five_week_average} valueLabel={`${Math.round(toNumber(metric?.compliance_rate, 0))}%`} t={t} />
        <div className="mt-3 flex flex-wrap justify-between gap-2">
          <p className="text-sm text-slate-600">{toNumber(metric?.completed, 0)} completed / {toNumber(metric?.expected, 0)} planned</p>
          <p className={`mt-3 text-sm font-semibold ${delta.startsWith('-') ? 'text-rose-700' : 'text-emerald-700'}`}>
            {delta} vs 90-day average
          </p>
        </div>
      </div>
    </section>
  );
}

function JournalMetricCard({ metric, t }) {
  const depthDelta = pointDelta(metric?.delta_depth_percentage);
  const journalDayPercentage = Math.round(toNumber(metric?.journal_day_percentage, 0));
  const journalDays = toNumber(metric?.journal_days_this_week, 0);
  const depthPercentage = Math.round(toNumber(metric?.depth_percentage, 0));
  const wisdomIndex = Math.round(toNumber(metric?.wisdom_index, 0));
  const monthAverageDepth = Math.round(toNumber(metric?.month_average_depth_percentage, 0));
  return (
    <section className="relative rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <KpiInfoButton label="About the Wisdom Index">
        {t('home.wisdom.description', 'Wisdom Index is journal consistency multiplied by reflection depth. Consistency is the percentage of the last 7 days with an entry; depth is shown as a percentage where 10/10 equals 100%.')}
      </KpiInfoButton>
      <CardHeader title="Wisdom Index" />
      <div className="mt-4">
        <SegmentedGauge value={wisdomIndex} benchmark={metric?.five_week_average} valueLabel={`${wisdomIndex}%`} t={t} />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div className="rounded-lg bg-slate-50 p-4 text-center">
          <div className="text-3xl font-semibold text-slate-950">{journalDayPercentage}%</div>
          <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Journal consistency</p>
          <p className="mt-3 text-xs font-semibold text-slate-600">{journalDays} of the last 7 days</p>
        </div>
        <div className="rounded-lg bg-slate-50 p-4 text-center">
          <div className="text-3xl font-semibold text-slate-950">{depthPercentage}%</div>
          <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{t('home.wisdom.depth', 'Depth')}</p>
          <p className={`mt-3 text-xs font-semibold ${depthDelta.startsWith('-') ? 'text-rose-700' : 'text-emerald-700'}`}>
            {t('home.wisdom.depthComparison', 'vs {{average}}% avg ({{delta}})')
              .replace('{{average}}', monthAverageDepth)
              .replace('{{delta}}', depthDelta)}
          </p>
        </div>
      </div>
    </section>
  );
}

function CombinedTrendChart({ trends }) {
  const width = 680;
  const height = 260;
  const padding = { top: 18, right: 18, bottom: 32, left: 38 };
  const mtn = (trends?.mtn || []).slice(-30);
  const habits = (trends?.habits || []).slice(-30);
  const journal = (trends?.journal || []).slice(-30);
  const energy = (trends?.energy || []).slice(-30);
  const dates = Array.from(new Set([...mtn, ...habits, ...journal, ...energy].map((item) => item.date))).sort().slice(-30);
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const byDate = (items) => new Map(items.map((item) => [item.date, item]));
  const maps = { mtn: byDate(mtn), habits: byDate(habits), journal: byDate(journal), energy: byDate(energy) };
  const dailyMtnTotals = dates.map((date) => toNumber(maps.mtn.get(date)?.mtn_score, 0));
  const highestDailyMtn = Math.max(...dailyMtnTotals, 0);
  const mtnPoints = dates.map((date, index) => ({
    date,
    value: highestDailyMtn ? clamp((dailyMtnTotals[index] / highestDailyMtn) * 100) : 0,
  }));
  const series = [
    { label: 'Move-the-needle', color: '#0f766e', points: mtnPoints },
    { label: 'Habits', color: '#2563eb', points: dates.map((date) => ({ date, value: clamp(toNumber(maps.habits.get(date)?.rolling_average, 0)) })) },
    { label: 'Journal depth', color: '#7c3aed', points: dates.map((date) => ({ date, value: clamp(toNumber(maps.journal.get(date)?.weekly_average, 0) * 10) })) },
    { label: 'Energy', color: '#ea580c', points: dates.map((date) => ({ date, value: maps.energy.get(date)?.energy_level ? clamp((toNumber(maps.energy.get(date)?.energy_level) / 5) * 100) : null })) },
  ];

  const pathFor = (points) => {
    const usable = points.filter((point) => point.value != null);
    if (!usable.length) return '';
    return usable.map((point, index) => {
      const x = padding.left + (dates.indexOf(point.date) / Math.max(dates.length - 1, 1)) * innerWidth;
      const y = padding.top + (1 - clamp(point.value) / 100) * innerHeight;
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    }).join(' ');
  };

  return (
    <div className="relative rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <KpiInfoButton label="About behavioral trends">
        A 30-day view of the main operating signals. Daily MTN is the sum of the scores for tasks completed that day, shown as a percentage of the highest daily MTN total in the visible period. Habits, journal depth, and energy are also normalized to a 0-100 scale.
      </KpiInfoButton>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Behavioral trends</p>
          <h2 className="mt-1 text-lg font-semibold text-slate-950">Leadership operating system</h2>
        </div>
        <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-1 text-xs font-medium text-slate-600">
          <span className="rounded-md bg-white px-3 py-1 shadow-sm">30 days</span>
          <span className="px-3 py-1 text-slate-400">7</span>
          <span className="px-3 py-1 text-slate-400">90</span>
        </div>
      </div>
      <div className="mt-4">
        <svg className="h-auto w-full" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Combined leadership trend chart">
          {[0, 25, 50, 75, 100].map((tick) => {
            const y = padding.top + (1 - tick / 100) * innerHeight;
            return (
              <g key={tick}>
                <line x1={padding.left} x2={width - padding.right} y1={y} y2={y} stroke="#e2e8f0" />
                <text x="8" y={y + 4} className="fill-slate-400 text-xs">{tick}</text>
              </g>
            );
          })}
          {series.map((item) => <path key={item.label} d={pathFor(item.points)} fill="none" stroke={item.color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />)}
          {dates.length > 0 && [0, Math.floor((dates.length - 1) / 2), dates.length - 1].map((index) => (
            <text key={`${dates[index]}-${index}`} x={padding.left + (index / Math.max(dates.length - 1, 1)) * innerWidth} y={height - 8} textAnchor={index === 0 ? 'start' : index === dates.length - 1 ? 'end' : 'middle'} className="fill-slate-400 text-xs">
              {new Date(`${dates[index]}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </text>
          ))}
        </svg>
      </div>
      <div className="mt-4 flex flex-wrap gap-3">
        {series.map((item) => (
          <div key={item.label} className="flex items-center gap-2 text-sm text-slate-600">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
            {item.label}
          </div>
        ))}
      </div>
    </div>
  );
}

function GoalProgressReviewTable({ reviews, onNavigate }) {
  const items = reviews || [];
  return (
    <section className="relative rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <KpiInfoButton label="About goal progress reviews">
        A compact executive view of your vision-level goals, their current health, and the next recommended focus.
      </KpiInfoButton>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Project status</p>
          <h2 className="mt-1 text-lg font-semibold text-slate-950">Goal progress reviews</h2>
        </div>
        <button onClick={() => onNavigate('my-goals')} className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50">
          Open Goals
        </button>
      </div>

      {items.length === 0 ? (
        <div className="mt-4 rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-600">
          Add goals and refresh the Progress Review page to see project status here.
        </div>
      ) : (
        <div className="mt-4 hidden overflow-x-auto rounded-lg border border-slate-200 lg:block">
          <div className="min-w-[920px]">
            <div className="grid grid-cols-[minmax(200px,0.8fr)_minmax(420px,1.8fr)_minmax(280px,1fr)] bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <div className="border-b border-slate-200 px-4 py-3">Goal</div>
              <div className="border-b border-slate-200 px-4 py-3">Executive Summary</div>
              <div className="border-b border-slate-200 px-4 py-3">Recommended Action</div>
            </div>
            {items.map((review) => {
              const health = goalHealthStyles[review.health] || goalHealthStyles.amber;
              return (
                <div key={review.goal_id} className="grid grid-cols-[minmax(200px,0.8fr)_minmax(420px,1.8fr)_minmax(280px,1fr)] border-b border-slate-100 last:border-b-0">
                  <div className={`border-l-4 px-4 py-4 ${health.accent}`}>
                    <h3 className="text-sm font-semibold leading-6 text-slate-950">{review.goal_title || 'Untitled goal'}</h3>
                  </div>
                  <div className="px-4 py-4 text-sm leading-6 text-slate-700">{review.executive_summary}</div>
                  <div className="px-4 py-4 text-sm font-medium leading-6 text-slate-900">{review.recommended_focus}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {items.length > 0 && (
        <div className="mt-4 lg:hidden">
          <div className="space-y-3">
            {items.map((review) => {
              const health = goalHealthStyles[review.health] || goalHealthStyles.amber;
              return (
                <article key={`mobile-${review.goal_id}`} className={`rounded-lg border border-slate-200 border-l-4 p-4 ${health.accent}`}>
                  <h3 className="text-sm font-semibold leading-6 text-slate-950">{review.goal_title || 'Untitled goal'}</h3>
                  <p className="mt-3 text-sm leading-6 text-slate-700">{review.executive_summary}</p>
                  <p className="mt-3 text-sm font-medium leading-6 text-slate-900">{review.recommended_focus}</p>
                </article>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

function TaskStack({ title, eyebrow, tasks, emptyText, onToggle, timezone, showPostponed = false }) {
  return (
    <section className="relative rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <KpiInfoButton label={`About ${title}`}>
        {showPostponed
          ? 'Highlights open tasks that have been postponed repeatedly, sorted by friction and MTN relevance.'
          : 'Highlights the open tasks with the strongest combination of MTN score, urgency, goal alignment, and priority.'}
      </KpiInfoButton>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{eyebrow}</p>
        <h2 className="mt-1 text-lg font-semibold text-slate-950">{title}</h2>
      </div>
      <div className="mt-4 space-y-3">
        {tasks.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-600">{emptyText}</div>
        ) : tasks.map((task) => (
          <article key={task.id} className="rounded-lg border border-slate-200 p-4">
            <div className="flex gap-3">
              {!showPostponed && (
                <button onClick={() => onToggle(task.id)} className="mt-0.5 h-5 w-5 shrink-0 rounded border border-slate-300 hover:border-teal-600" aria-label={`Complete ${task.title}`} />
              )}
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-semibold text-slate-950">{task.title}</h3>
                <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-600">
                  <span className="rounded bg-slate-100 px-2 py-1">{task.due_date ? formatDueDate(task.due_date, timezone) : 'No due date'}</span>
                  {task.goal_title && <span className="rounded bg-teal-50 px-2 py-1 text-teal-800">{task.goal_title}</span>}
                  {showPostponed && <span className="rounded bg-rose-50 px-2 py-1 text-rose-800">Postponed {task.times_postponed}x</span>}
                </div>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function NextTrialCard({ trial, onNavigate }) {
  return (
    <section className="relative rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <KpiInfoButton label="About the recommended next trial">
        The next Journey trial Alfred recommends based on open trials, belt readiness, and the weakest current leadership wheel signal.
      </KpiInfoButton>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Recommended Next Trial</p>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            <h2 className="text-base font-semibold text-slate-950">{trial?.title}</h2>
            <span className="text-sm text-slate-600">{trial?.domain}</span>
            <span className="text-sm text-slate-600">{trial?.belt}</span>
          </div>
          <p className="mt-1 text-sm text-slate-600">{trial?.reason}</p>
        </div>
        <button onClick={() => onNavigate('my-journey')} className="shrink-0 rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50">
          {trial?.cta || 'Start Trial'}
        </button>
      </div>
    </section>
  );
}

export default function Home({ apiUrl, userNumber, onNavigate }) {
  const { timezone, t } = useLanguage();
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [opportunityActions, setOpportunityActions] = useState({});

  useEffect(() => {
    if (apiUrl == null || !userNumber) return;
    setLoading(true);
    setError('');
    axios.get(`${apiUrl}/api/home/dashboard`, { params: { user_number: userNumber } })
      .then((response) => setSnapshot(response.data))
      .catch(() => setError('Home needs a moment to load your cached leadership dashboard.'))
      .finally(() => setLoading(false));
  }, [apiUrl, userNumber]);

  const payload = snapshot?.payload || {};
  const metrics = payload.metrics || {};
  const today = getTodayET(timezone);

  const handleTaskToggle = async (taskId) => {
    try {
      await axios.patch(`${apiUrl}/api/tasks/${taskId}/toggle`, {}, { params: { user_number: userNumber } });
      window.dispatchEvent(new Event('alfred-sidebar-counts-refresh'));
      setSnapshot((prev) => ({
        ...prev,
        payload: {
          ...prev.payload,
          top_tasks: (prev.payload.top_tasks || []).filter((task) => task.id !== taskId),
        },
      }));
    } catch {
      // The next daily snapshot will correct this if the toggle fails.
    }
  };

  const handleOpportunity = async (opportunityId, action) => {
    setOpportunityActions((prev) => ({ ...prev, [opportunityId]: 'working' }));
    try {
      await axios.post(`${apiUrl}/api/opportunities/${opportunityId}/${action === 'accept' ? 'accept' : 'decline'}`, {
        user_number: userNumber,
        reason: action === 'decline' ? 'Dismissed from Home' : undefined,
      });
      setOpportunityActions((prev) => ({ ...prev, [opportunityId]: action === 'accept' ? 'accepted' : 'dismissed' }));
    } catch {
      setOpportunityActions((prev) => {
        const next = { ...prev };
        delete next[opportunityId];
        return next;
      });
    }
  };

  if (loading) return <div className="p-6 text-slate-600">Loading your cached leadership dashboard...</div>;
  if (error) return <div className="p-6 text-slate-700">{error}</div>;

  return (
    <div className="min-h-full bg-slate-50">
      <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold text-slate-950">My Executive Operating System</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-600">Weekly performance, behavioral momentum, execution focus, and Journey readiness in one operating view.</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">
            <span className="font-semibold text-slate-900">Today:</span> {new Date(`${today}T00:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
          </div>
        </header>

        {!payload.activation_ready && (
          <section className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-amber-950">Alfred needs a little more signal</h2>
                <p className="mt-1 text-sm text-amber-900">Add the first few leadership inputs and this page becomes a sharper operating dashboard.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {emptyStateActions.map((action) => (
                  <button key={action.page} onClick={() => onNavigate(action.page)} className="rounded-md bg-white px-3 py-2 text-sm font-medium text-amber-950 shadow-sm hover:bg-amber-100">{action.label}</button>
                ))}
              </div>
            </div>
          </section>
        )}

        <div className="grid gap-5 xl:grid-cols-3">
          <MtnScoreCard metric={metrics.mtn || {}} t={t} />
          <HabitsMetricCard metric={metrics.habits || {}} t={t} />
          <JournalMetricCard metric={metrics.journal || {}} t={t} />
        </div>

        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.8fr)_minmax(320px,0.8fr)]">
          <CombinedTrendChart trends={payload.trends || {}} />
          <TaskStack title="Top Tasks" eyebrow="Execution focus" tasks={payload.top_tasks || []} emptyText="Add tasks to give Alfred an execution focus." onToggle={handleTaskToggle} timezone={timezone} />
          <section className="relative rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <KpiInfoButton label="About recommended MTN actions">
              Suggested actions are drawn from Alfred opportunity signals and ranked by their expected move-the-needle value.
            </KpiInfoButton>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Recommended MTN actions</p>
            <h2 className="mt-1 text-lg font-semibold text-slate-950">Move the needle next</h2>
            <div className="mt-4 space-y-3">
              {(payload.recommendations || []).length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-600">Alfred will recommend actions once enough context exists.</div>
              ) : payload.recommendations.map((item) => {
                const state = opportunityActions[item.id];
                return (
                  <article key={item.id} className="rounded-lg border border-slate-200 p-3">
                    <h3 className="text-sm font-semibold text-slate-950">{item.title}</h3>
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <span className="rounded bg-teal-50 px-2 py-1 text-xs font-semibold text-teal-800">MTN {toNumber(item.mtn_score, 0).toFixed(1)}</span>
                      <div className="flex gap-2">
                        <button onClick={() => handleOpportunity(item.id, 'accept')} className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50" disabled={Boolean(state)}>{state === 'accepted' ? 'Added' : 'Add to Tasks'}</button>
                        <button onClick={() => handleOpportunity(item.id, 'decline')} className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50" disabled={Boolean(state)}>{state === 'dismissed' ? 'Dismissed' : 'Dismiss'}</button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        </div>

        <div className="mt-5">
          <GoalProgressReviewTable reviews={payload.goal_progress_reviews || []} onNavigate={onNavigate} />
        </div>

        <div className="mt-5">
          <TaskStack title="Top 3 Procrastinated Tasks" eyebrow="Execution friction" tasks={payload.procrastinated_tasks || []} emptyText="No repeated postponement pattern is visible yet." onToggle={handleTaskToggle} timezone={timezone} showPostponed />
        </div>

        <div className="mt-5">
          <NextTrialCard trial={payload.next_trial || {}} onNavigate={onNavigate} />
        </div>
      </div>
    </div>
  );
}
