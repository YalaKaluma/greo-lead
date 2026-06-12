import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { formatDueDate, getTodayET, isOverdueET, isTodayET } from '../utils/taskHelpers';
import { useLanguage } from '../i18n/LanguageContext';

const DOMAIN_LABELS = {
  vision: 'Vision & Goals',
  people: 'People',
  execute: 'Prioritize & Execute',
  energy: 'Time & Energy',
  learning: 'Learning & Development',
};

const DOMAIN_ORDER = ['vision', 'people', 'execute', 'energy', 'learning'];

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

const normalizeMtn = (value) => {
  const score = toNumber(value, 0);
  return score <= 1 ? score * 10 : score;
};

const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, value));

const pctDelta = (value) => {
  const number = toNumber(value, 0);
  if (number > 0) return `+${Math.round(number)} pts`;
  if (number < 0) return `${Math.round(number)} pts`;
  return '0 pts';
};

const scoreDelta = (value) => {
  const number = toNumber(value, 0);
  if (number > 0) return `+${number.toFixed(1)}`;
  if (number < 0) return number.toFixed(1);
  return '0.0';
};

const formatBelt = (value) => {
  if (!value) return 'White Belt';
  return `${String(value).charAt(0).toUpperCase()}${String(value).slice(1)} Belt`;
};

const getGoalTitle = (goalsById, goalId) => {
  if (!goalId) return null;
  const goal = goalsById.get(Number(goalId));
  return goal?.title || goal?.goal_text || null;
};

const readinessFromValidation = (validation) => {
  if (!validation) return 'Building evidence';
  if (validation.is_complete || validation.is_eligible) return 'Ready';
  const completed = toNumber(validation.completed_signals ?? validation.completed ?? validation.met, 0);
  const required = toNumber(validation.required_signals ?? validation.required ?? validation.total, 0);
  if (required > 0 && completed >= required) return 'Ready';
  if (completed > 0) return 'In progress';
  return 'Needs evidence';
};

const progressFromValidation = (validation) => {
  if (!validation) return 0;
  if (validation.progress_percent != null) return clamp(toNumber(validation.progress_percent));
  if (validation.is_complete || validation.is_eligible) return 100;
  const completed = toNumber(validation.completed_signals ?? validation.completed ?? validation.met, 0);
  const required = toNumber(validation.required_signals ?? validation.required ?? validation.total, 0);
  return required ? clamp(Math.round((completed / required) * 100)) : 0;
};

function MetricCard({ eyebrow, title, value, detail, delta, status, children, sparkline }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{eyebrow}</p>
          <h2 className="mt-1 text-base font-semibold text-slate-900">{title}</h2>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">{status}</span>
      </div>
      <div className="mt-5 flex items-end justify-between gap-4">
        <div>
          <div className="text-4xl font-semibold text-slate-950">{value}</div>
          <p className="mt-2 text-sm text-slate-600">{detail}</p>
          <p className={`mt-3 text-sm font-semibold ${String(delta).startsWith('-') ? 'text-rose-700' : 'text-emerald-700'}`}>
            {delta} vs last week
          </p>
        </div>
        {sparkline}
        {children}
      </div>
    </section>
  );
}

function MiniSparkline({ points = [], color = '#0f766e' }) {
  const values = points.slice(-14).map((item) => toNumber(item));
  if (values.length < 2) {
    return <div className="h-12 w-24 rounded bg-slate-50" />;
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const coordinates = values.map((value, index) => {
    const x = (index / (values.length - 1)) * 96;
    const y = 44 - ((value - min) / range) * 36;
    return `${x},${y}`;
  });

  return (
    <svg className="h-12 w-24 overflow-visible" viewBox="0 0 96 48" role="img" aria-label="Recent trend">
      <polyline fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" points={coordinates.join(' ')} />
    </svg>
  );
}

function ProgressRing({ value }) {
  const radius = 34;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clamp(value) / 100) * circumference;
  return (
    <svg className="h-24 w-24 shrink-0" viewBox="0 0 88 88" role="img" aria-label={`${value}% complete`}>
      <circle cx="44" cy="44" r={radius} stroke="#e2e8f0" strokeWidth="9" fill="none" />
      <circle
        cx="44"
        cy="44"
        r={radius}
        stroke="#0f766e"
        strokeWidth="9"
        fill="none"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform="rotate(-90 44 44)"
      />
      <text x="44" y="49" textAnchor="middle" className="fill-slate-900 text-lg font-semibold">{Math.round(value)}%</text>
    </svg>
  );
}

function CombinedTrendChart({ series }) {
  const width = 680;
  const height = 260;
  const padding = { top: 18, right: 18, bottom: 32, left: 38 };
  const dates = series[0]?.points?.map((point) => point.date) || [];
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;

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
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
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

      <div className="mt-4 overflow-x-auto">
        <svg className="min-w-[620px] max-w-full" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Combined leadership trend chart">
          {[0, 25, 50, 75, 100].map((tick) => {
            const y = padding.top + (1 - tick / 100) * innerHeight;
            return (
              <g key={tick}>
                <line x1={padding.left} x2={width - padding.right} y1={y} y2={y} stroke="#e2e8f0" />
                <text x="8" y={y + 4} className="fill-slate-400 text-xs">{tick}</text>
              </g>
            );
          })}
          {series.map((item) => (
            <path key={item.label} d={pathFor(item.points)} fill="none" stroke={item.color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <title>{item.label}</title>
            </path>
          ))}
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

export default function Home({ apiUrl, userNumber, onNavigate }) {
  const { timezone } = useLanguage();
  const [data, setData] = useState({
    tasks: [],
    goals: [],
    habits: [],
    mtn: null,
    habitTrends: null,
    journal: null,
    readiness: null,
    assessment: null,
    trials: [],
    opportunities: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [opportunityActions, setOpportunityActions] = useState({});
  const [completingTaskIds, setCompletingTaskIds] = useState(new Set());

  const loadHome = async () => {
    if (apiUrl == null || !userNumber) return;
    setLoading(true);
    setError('');

    const safeGet = (url, params) => axios.get(url, { params }).then((response) => response.data).catch(() => null);
    const safePost = (url, body) => axios.post(url, body).then((response) => response.data).catch(() => null);

    const [
      tasks,
      goals,
      habits,
      mtn,
      habitTrends,
      journal,
      readiness,
      assessment,
      trials,
      opportunities,
    ] = await Promise.all([
      safeGet(`${apiUrl}/api/tasks/`, { user_number: userNumber, filter_type: 'all' }),
      safeGet(`${apiUrl}/api/journey/goals`, { user_number: userNumber }),
      safeGet(`${apiUrl}/api/habits`, { user_number: userNumber }),
      safeGet(`${apiUrl}/api/tasks/mtn-trends`, { user_number: userNumber }),
      safeGet(`${apiUrl}/api/habits/trends`, { user_number: userNumber }),
      safeGet(`${apiUrl}/api/journal/journal/trends`, { user_number: userNumber }),
      safeGet(`${apiUrl}/api/journey/belt-readiness/status`, { user_number: userNumber }),
      safeGet(`${apiUrl}/api/journey/belt-assessments/latest`, { user_number: userNumber }),
      safeGet(`${apiUrl}/api/journey/belt-trials`, { user_number: userNumber }),
      safePost(`${apiUrl}/api/opportunities/generate`, {
        user_number: userNumber,
        surface: 'home',
        type: 'task',
        limit: 3,
      }),
    ]);

    setData({
      tasks: Array.isArray(tasks) ? tasks : [],
      goals: Array.isArray(goals) ? goals : [],
      habits: Array.isArray(habits) ? habits : [],
      mtn,
      habitTrends,
      journal,
      readiness,
      assessment,
      trials: Array.isArray(trials) ? trials : [],
      opportunities: opportunities?.opportunities || [],
    });
    setLoading(false);
  };

  useEffect(() => {
    loadHome().catch(() => {
      setError('Home needs a moment to gather your leadership signals.');
      setLoading(false);
    });
  }, [apiUrl, userNumber]);

  const goalsById = useMemo(() => new Map(data.goals.map((goal) => [Number(goal.id), goal])), [data.goals]);
  const today = getTodayET(timezone);

  const metrics = useMemo(() => {
    const mtnSummary = data.mtn?.summary || {};
    const currentMtn = toNumber(mtnSummary.last_7_days?.average_score, 0);
    const mtnDelta = toNumber(mtnSummary.last_7_days?.trend?.delta_vs_30, 0);
    const habitWeek = data.habitTrends?.summary?.last_7_days || {};
    const habitPrevious = data.habitTrends?.summary?.last_21_days || {};
    const habitDelta = toNumber(habitWeek.compliance_rate, 0) - toNumber(habitPrevious.compliance_rate, 0);
    const journalChart = data.journal?.trend_chart || [];
    const journalWeek = journalChart.slice(-7);
    const journalPrevious = journalChart.slice(-14, -7);
    const entriesThisWeek = journalWeek.reduce((sum, item) => sum + toNumber(item.entry_count, 0), 0);
    const weeklyDepthValues = journalWeek.filter((item) => item.daily_average > 0).map((item) => item.daily_average);
    const previousDepthValues = journalPrevious.filter((item) => item.daily_average > 0).map((item) => item.daily_average);
    const avgDepth10 = weeklyDepthValues.length ? weeklyDepthValues.reduce((sum, item) => sum + item, 0) / weeklyDepthValues.length : 0;
    const previousDepth10 = previousDepthValues.length ? previousDepthValues.reduce((sum, item) => sum + item, 0) / previousDepthValues.length : 0;

    return {
      currentMtn,
      mtnDelta,
      mtnStatus: mtnDelta > 0.2 ? 'Strong momentum' : mtnDelta < -0.2 ? 'Needs attention' : 'Stable',
      habitRate: toNumber(habitWeek.compliance_rate, 0),
      habitCompleted: toNumber(habitWeek.completed, 0),
      habitExpected: toNumber(habitWeek.expected, 0),
      habitDelta,
      habitStatus: habitDelta >= 5 ? 'Improving' : habitDelta <= -5 ? 'Needs attention' : 'Stable',
      entriesThisWeek,
      avgDepth5: avgDepth10 / 2,
      depthDelta5: (avgDepth10 - previousDepth10) / 2,
      journalStatus: avgDepth10 >= 7 ? 'Deep reflection' : entriesThisWeek >= 3 ? 'Consistent' : 'Needs more depth',
    };
  }, [data]);

  const trendSeries = useMemo(() => {
    const mtnChart = (data.mtn?.trend_chart || []).slice(-30);
    const habitChart = (data.habitTrends?.trend_chart || []).slice(-30);
    const journalChart = (data.journal?.trend_chart || []).slice(-30);
    const energyChart = (data.habitTrends?.energy_trend || []).slice(-30);
    const dates = Array.from(new Set([...mtnChart, ...habitChart, ...journalChart, ...energyChart].map((item) => item.date))).sort().slice(-30);
    const byDate = (items) => new Map(items.map((item) => [item.date, item]));

    const mtnMap = byDate(mtnChart);
    const habitMap = byDate(habitChart);
    const journalMap = byDate(journalChart);
    const energyMap = byDate(energyChart);

    return [
      {
        label: 'MTN score',
        color: '#0f766e',
        points: dates.map((date) => ({ date, value: clamp(toNumber(mtnMap.get(date)?.rolling_average, 0) * 10) })),
      },
      {
        label: 'Habits',
        color: '#2563eb',
        points: dates.map((date) => ({ date, value: clamp(toNumber(habitMap.get(date)?.rolling_average, 0)) })),
      },
      {
        label: 'Journal depth',
        color: '#7c3aed',
        points: dates.map((date) => ({ date, value: clamp(toNumber(journalMap.get(date)?.weekly_average, 0) * 10) })),
      },
      {
        label: 'Energy',
        color: '#ea580c',
        points: dates.map((date) => {
          const level = energyMap.get(date)?.energy_level;
          return { date, value: level ? clamp((toNumber(level) / 5) * 100) : null };
        }),
      },
    ];
  }, [data]);

  const activationReady = (
    (data.goals.length >= 1 || data.tasks.length >= 3) &&
    data.habits.length >= 1 &&
    (toNumber(data.journal?.summary?.total_journal_entries, 0) >= 1 || data.trials.some((trial) => ['passed', 'completed'].includes(String(trial.status).toLowerCase())))
  );

  const topTasks = useMemo(() => {
    return data.tasks
      .filter((task) => String(task.status || '').toLowerCase() !== 'completed')
      .sort((a, b) => {
        const aMtn = normalizeMtn(a.mtn_score_today ?? a.move_the_needle_score);
        const bMtn = normalizeMtn(b.mtn_score_today ?? b.move_the_needle_score);
        const aUrgent = isOverdueET(a.due_date, timezone) || isTodayET(a.due_date, timezone) ? 1 : 0;
        const bUrgent = isOverdueET(b.due_date, timezone) || isTodayET(b.due_date, timezone) ? 1 : 0;
        const aAligned = a.goal_id ? 1 : 0;
        const bAligned = b.goal_id ? 1 : 0;
        const priority = { high: 3, medium: 2, low: 1 };
        return (
          bMtn - aMtn ||
          bUrgent - aUrgent ||
          bAligned - aAligned ||
          (priority[String(b.priority || '').toLowerCase()] || 0) - (priority[String(a.priority || '').toLowerCase()] || 0)
        );
      })
      .slice(0, 5);
  }, [data.tasks, timezone]);

  const wheelDomains = useMemo(() => {
    const dimensionScores = data.assessment?.journey_depth_scores || data.assessment?.developmental_dimension_scores || data.assessment?.dimension_scores || {};
    const missingTrials = Array.isArray(data.readiness?.missing_trials) ? data.readiness.missing_trials : [];
    const currentBelt = data.readiness?.current_belt || 'white';
    return DOMAIN_ORDER.map((domain) => {
      const missing = missingTrials.filter((trial) => trial.dimension_id === domain).length;
      const passed = data.trials.filter((trial) => (
        trial.dimension_id === domain &&
        (trial.target_belt || currentBelt) === currentBelt &&
        ['passed', 'completed'].includes(String(trial.status || '').toLowerCase())
      )).length;
      const required = passed + missing;
      const validation = {
        completed: passed,
        required,
        is_complete: required > 0 && missing === 0,
      };
      const assessmentScore = dimensionScores[domain]?.score ?? dimensionScores[DOMAIN_LABELS[domain]] ?? dimensionScores[domain];
      return {
        id: domain,
        label: DOMAIN_LABELS[domain],
        belt: formatBelt(currentBelt),
        readiness: readinessFromValidation(validation),
        progress: Math.max(progressFromValidation(validation), clamp(toNumber(assessmentScore, 0) * 10)),
      };
    });
  }, [data.readiness, data.assessment, data.trials]);

  const nextTrial = useMemo(() => {
    const currentBelt = data.readiness?.target_belt || data.readiness?.current_belt || 'yellow';
    const incomplete = data.trials.find((trial) => !['passed', 'completed'].includes(String(trial.status || '').toLowerCase()));
    if (incomplete) {
      return {
        title: `Complete ${formatBelt(incomplete.target_belt)} ${String(incomplete.trial_type || 'reflection').replace(/_/g, ' ')} trial`,
        domain: DOMAIN_LABELS[incomplete.dimension_id] || incomplete.dimension_id,
        belt: formatBelt(incomplete.target_belt),
        cta: 'Continue Trial',
        reason: 'This trial is already open and gives Alfred the clearest next evidence for your Journey progression.',
      };
    }

    const weakest = [...wheelDomains].sort((a, b) => a.progress - b.progress)[0] || wheelDomains[0];
    return {
      title: `${formatBelt(currentBelt)} reflection trial`,
      domain: weakest?.label || 'Vision & Goals',
      belt: formatBelt(currentBelt),
      cta: 'Start Trial',
      reason: `${weakest?.label || 'This domain'} has the most room for evidence, so a focused reflection is the best next leadership signal.`,
    };
  }, [data.readiness, data.trials, wheelDomains]);

  const toggleTask = async (taskId) => {
    setCompletingTaskIds((prev) => new Set([...prev, taskId]));
    try {
      await axios.patch(`${apiUrl}/api/tasks/${taskId}/toggle`, {}, { params: { user_number: userNumber } });
      setData((prev) => ({ ...prev, tasks: prev.tasks.filter((task) => task.id !== taskId) }));
    } catch {
      setCompletingTaskIds((prev) => {
        const next = new Set(prev);
        next.delete(taskId);
        return next;
      });
    }
  };

  const handleOpportunity = async (opportunityId, action) => {
    setOpportunityActions((prev) => ({ ...prev, [opportunityId]: 'working' }));
    try {
      const path = action === 'accept' ? 'accept' : 'decline';
      await axios.post(`${apiUrl}/api/opportunities/${opportunityId}/${path}`, {
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

  if (loading) {
    return <div className="p-6 text-slate-600">Building your leadership dashboard...</div>;
  }

  if (error) {
    return <div className="p-6 text-slate-700">{error}</div>;
  }

  return (
    <div className="min-h-full bg-slate-50">
      <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">Executive leadership dashboard</p>
            <h1 className="mt-2 text-3xl font-semibold text-slate-950">Home</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-600">
              Weekly performance, behavioral momentum, execution focus, and Journey readiness in one operating view.
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">
            <span className="font-semibold text-slate-900">Today:</span> {new Date(`${today}T00:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
          </div>
        </header>

        {!activationReady && (
          <section className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-amber-950">Alfred needs a little more signal</h2>
                <p className="mt-1 text-sm text-amber-900">Add the first few leadership inputs and this page becomes a much sharper operating dashboard.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {emptyStateActions.map((action) => (
                  <button key={action.page} onClick={() => onNavigate(action.page)} className="rounded-md bg-white px-3 py-2 text-sm font-medium text-amber-950 shadow-sm hover:bg-amber-100">
                    {action.label}
                  </button>
                ))}
              </div>
            </div>
          </section>
        )}

        <div className="grid gap-5 xl:grid-cols-3">
          <MetricCard
            eyebrow="Weekly leadership output"
            title="MTN Score"
            value={metrics.currentMtn.toFixed(1)}
            detail={`${toNumber(data.mtn?.summary?.last_7_days?.completed_tasks, 0)} completed high-leverage tasks`}
            delta={scoreDelta(metrics.mtnDelta)}
            status={metrics.mtnStatus}
            sparkline={<MiniSparkline points={(data.mtn?.trend_chart || []).map((item) => item.rolling_average)} />}
          />
          <MetricCard
            eyebrow="Behavioral consistency"
            title="Habits Compliance"
            value={`${Math.round(metrics.habitRate)}%`}
            detail={`${metrics.habitCompleted} completed / ${metrics.habitExpected} planned`}
            delta={pctDelta(metrics.habitDelta)}
            status={metrics.habitStatus}
          >
            <ProgressRing value={metrics.habitRate} />
          </MetricCard>
          <MetricCard
            eyebrow="Reflection quality"
            title="Journal Performance"
            value={`${metrics.entriesThisWeek} entries`}
            detail={`Avg depth: ${metrics.avgDepth5.toFixed(1)} / 5`}
            delta={scoreDelta(metrics.depthDelta5)}
            status={metrics.journalStatus}
            sparkline={<MiniSparkline points={(data.journal?.trend_chart || []).map((item) => item.weekly_average)} color="#7c3aed" />}
          />
        </div>

        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.8fr)_minmax(320px,0.8fr)]">
          <CombinedTrendChart series={trendSeries} />

          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Execution focus</p>
                <h2 className="mt-1 text-lg font-semibold text-slate-950">Top Todos</h2>
              </div>
              <button onClick={() => onNavigate('todo-list')} className="rounded-md border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">View all</button>
            </div>
            <div className="mt-4 space-y-3">
              {topTasks.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-600">Add your first task to give Alfred an execution focus.</div>
              ) : topTasks.map((task) => {
                const mtn = normalizeMtn(task.mtn_score_today ?? task.move_the_needle_score);
                return (
                  <article key={task.id} className="rounded-lg border border-slate-200 p-4">
                    <div className="flex gap-3">
                      <button
                        onClick={() => toggleTask(task.id)}
                        className="mt-0.5 h-5 w-5 shrink-0 rounded border border-slate-300 hover:border-teal-600"
                        aria-label={`Complete ${task.title}`}
                        disabled={completingTaskIds.has(task.id)}
                      />
                      <div className="min-w-0 flex-1">
                        <h3 className="text-sm font-semibold text-slate-950">{task.title}</h3>
                        <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-600">
                          <span className="rounded bg-slate-100 px-2 py-1">{task.due_date ? formatDueDate(task.due_date, timezone) : 'No due date'}</span>
                          {getGoalTitle(goalsById, task.goal_id) && <span className="rounded bg-teal-50 px-2 py-1 text-teal-800">{getGoalTitle(goalsById, task.goal_id)}</span>}
                          <span className="rounded bg-slate-900 px-2 py-1 text-white">MTN {mtn.toFixed(1)}</span>
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Recommended MTN actions</p>
              <h2 className="mt-1 text-lg font-semibold text-slate-950">Move the needle next</h2>
            </div>
            <div className="mt-4 space-y-3">
              {data.opportunities.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-600">Alfred will recommend actions once goals, tasks, and recent behavior create enough context.</div>
              ) : data.opportunities.map((item) => {
                const state = opportunityActions[item.id];
                return (
                  <article key={item.id} className="rounded-lg border border-slate-200 p-4">
                    <h3 className="text-sm font-semibold text-slate-950">{item.title}</h3>
                    <p className="mt-2 text-sm text-slate-600">{item.reason || item.description || 'This action appears likely to unlock meaningful progress.'}</p>
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <span className="rounded bg-teal-50 px-2 py-1 text-xs font-semibold text-teal-800">MTN {toNumber(item.mtn_score, 0).toFixed(1)}</span>
                      <div className="flex gap-2">
                        <button onClick={() => handleOpportunity(item.id, 'accept')} className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700" disabled={Boolean(state)}>
                          {state === 'accepted' ? 'Added' : 'Add to Tasks'}
                        </button>
                        <button onClick={() => handleOpportunity(item.id, 'decline')} className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50" disabled={Boolean(state)}>
                          {state === 'dismissed' ? 'Dismissed' : 'Dismiss'}
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        </div>

        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(340px,0.8fr)]">
          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Leadership development</p>
            <h2 className="mt-1 text-lg font-semibold text-slate-950">Leadership Wheel Status</h2>
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              {wheelDomains.map((domain) => (
                <div key={domain.id} className="rounded-lg border border-slate-200 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-950">{domain.label}</h3>
                      <p className="mt-1 text-xs text-slate-500">{domain.belt}</p>
                    </div>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">{domain.readiness}</span>
                  </div>
                  <div className="mt-4 h-2 rounded-full bg-slate-100">
                    <div className="h-2 rounded-full bg-teal-700" style={{ width: `${domain.progress}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-slate-950 p-5 text-white shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-teal-200">Best next trial</p>
            <h2 className="mt-3 text-xl font-semibold">{nextTrial.title}</h2>
            <div className="mt-4 space-y-2 text-sm text-slate-300">
              <p><span className="font-semibold text-white">Domain:</span> {nextTrial.domain}</p>
              <p><span className="font-semibold text-white">Belt level:</span> {nextTrial.belt}</p>
              <p>{nextTrial.reason}</p>
            </div>
            <button onClick={() => onNavigate('my-journey')} className="mt-6 rounded-md bg-white px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-slate-100">
              {nextTrial.cta}
            </button>
          </section>
        </div>
      </div>
    </div>
  );
}
