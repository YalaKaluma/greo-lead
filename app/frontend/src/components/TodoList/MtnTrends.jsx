import { Component, useState } from 'react';
import TrendRangeToggle from '../TrendRangeToggle';
import KpiInfoButton from '../KpiInfoButton';
import { dateKey, formatShortDate } from '../../utils/todoDateLogic.js';
import {
  buildMtnDateTicks,
  buildMtnTrendPath,
  colorForMtnScore,
  describeMtnAverageComparison,
  extractTrendChart,
  fillMtnTrendDates,
  formatMtnNumber,
  MTN_CHART_BOTTOM_PADDING,
  MTN_CHART_HEIGHT,
  MTN_CHART_PADDING,
  MTN_CHART_WIDTH,
  STATIC_MTN_SEGMENTS,
  weekdayIndexFromDate,
} from '../../utils/todoMtnTrends.js';

export function DailyMtnNeedle({ score, completedTasks, benchmark, onClick }) {
  const scaleMax = Math.max(Number(benchmark?.effectiveMax || 20), 1);
  const cappedScore = Math.max(0, Math.min(Number(score || 0), scaleMax));
  const needleLeft = 7 + (cappedScore / scaleMax) * 86;
  const comparison = benchmark?.isDynamic
    ? describeMtnAverageComparison(score, benchmark.avgMtn)
    : 'Building your 30-day benchmark';
  const label = completedTasks > 0
    ? `${formatMtnNumber(score)} MTN from ${completedTasks} done`
    : `${formatMtnNumber(score)} MTN today`;
  const title = benchmark?.isDynamic
    ? `Today's MTN: ${formatMtnNumber(score)}\n${comparison}`
    : `${label}\nStatic scale until 7 active MTN days`;
  const segments = benchmark?.segments?.length ? benchmark.segments : STATIC_MTN_SEGMENTS;

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-96 max-w-[82vw] rounded-md px-1 py-1 text-left transition-colors hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
      title={title}
      aria-label={title}
    >
      <div className="relative h-8">
        <div className="absolute inset-x-0 top-3 flex h-3 overflow-hidden rounded-full border border-slate-200 bg-slate-100">
          {segments.map(segment => (
            <span
              key={segment.label}
              style={{
                backgroundColor: segment.color,
                flexGrow: segment.range,
                flexBasis: 0,
              }}
            />
          ))}
        </div>
        <div
          className="absolute top-0 h-8 w-1 rounded-full bg-slate-900 shadow-sm transition-all"
          style={{ left: `${needleLeft}%` }}
        >
          <span className="absolute -left-[5px] -top-1 h-0 w-0 border-l-[7px] border-r-[7px] border-t-[8px] border-l-transparent border-r-transparent border-t-slate-900" />
        </div>
      </div>
    </button>
  );
}

function IconSvg({ children, className = '' }) {
  return (
    <svg className={`h-4 w-4 ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

function CloseIcon() {
  return (
    <IconSvg>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </IconSvg>
  );
}

function formatDateTimeForDisplay(value, timezone) {
  if (!value) return '';
  return new Date(value).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: timezone
  });
}

export function MtnBreakdownModal({ score, tasks, date, timezone, onClose }) {
  return (
    <div className="fixed inset-0 z-50 bg-slate-950/40 flex items-center justify-center px-4 py-6">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-2xl max-h-[88vh] overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Today's MTN breakdown</h2>
            <p className="text-sm text-slate-500 mt-1">
              {formatMtnNumber(score)} MTN on {date} from {tasks.length} completed task(s)
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-800 p-2 rounded-lg hover:bg-slate-100"
            aria-label="Close MTN breakdown"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="p-5 overflow-y-auto max-h-[calc(88vh-92px)]">
          {tasks.length === 0 ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">
              No completed tasks have contributed to today's MTN score yet.
            </div>
          ) : (
            <div className="space-y-2">
              {tasks.map(task => (
                <div key={task.id} className="flex items-start justify-between gap-4 rounded-lg border border-slate-200 bg-white px-4 py-3">
                  <div className="min-w-0">
                    <div className="font-medium text-slate-900">{task.title}</div>
                    {task.completed_at && (
                      <div className="mt-1 text-xs text-slate-400">
                        Completed {formatDateTimeForDisplay(task.completed_at, timezone)}
                      </div>
                    )}
                  </div>
                  <div className="shrink-0 rounded-md bg-blue-50 px-2.5 py-1 text-sm font-semibold text-blue-700">
                    {formatMtnNumber(task.mtn_score)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatTile({ label, value, detail, info }) {
  return (
    <div className="relative rounded-lg border bg-white p-4">
      {info && <KpiInfoButton label={`About ${label}`}>{info}</KpiInfoButton>}
      <div className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-slate-900">{value}</div>
      {detail && <div className="mt-1 text-sm text-slate-500">{detail}</div>}
    </div>
  );
}

export class TrendsErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error) {
    console.error('Task trends render failed:', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
          Task trends could not render with the current chart data. The task list is still available.
          <button
            type="button"
            onClick={() => this.setState({ hasError: false })}
            className="ml-3 rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100"
          >
            Retry
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

function TaskMtnTrendChart({ data }) {
  const [rangeDays, setRangeDays] = useState(21);
  const rows = (Array.isArray(data) ? data : [])
    .filter(item => item && typeof item === 'object' && dateKey(item.date))
    .map(item => ({
      date: dateKey(item.date),
      mtnScore: Number(item.mtn_score || 0),
      rollingAverage: Number(item.rolling_average || 0),
      completedTasks: Number(item.completed_tasks || 0),
    }));
  const visibleRows = fillMtnTrendDates(rows).slice(-rangeDays);
  const maxValue = Math.max(
    1,
    Math.ceil(Math.max(...visibleRows.flatMap(item => [item.mtnScore, item.rollingAverage]), 0) * 1.15)
  );
  const dateTicks = buildMtnDateTicks(visibleRows);
  const dailyPath = buildMtnTrendPath(visibleRows, 'mtnScore', maxValue);
  const averagePath = buildMtnTrendPath(visibleRows, 'rollingAverage', maxValue);
  const yAxisValues = [0, maxValue / 4, maxValue / 2, (maxValue * 3) / 4, maxValue];
  const baselineY = MTN_CHART_HEIGHT - MTN_CHART_BOTTOM_PADDING;

  return (
    <div className="relative rounded-lg border bg-white p-4">
      <KpiInfoButton label="About the MTN score trend">
        Shows daily MTN from completed tasks plus the 7-day rolling average used for the short-term trend.
      </KpiInfoButton>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">MTN Score Trend</h2>
          <p className="mt-1 text-sm text-slate-500">Last {rangeDays} days of task momentum.</p>
          <div className="mt-2 flex flex-wrap gap-4 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-slate-300" /> Daily MTN</span>
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue-600" /> 7-day average</span>
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-slate-500" /> No input</span>
          </div>
        </div>
        <TrendRangeToggle value={rangeDays} onChange={setRangeDays} label="Task trend range" />
      </div>

      {visibleRows.length === 0 ? (
        <div className="mt-4 rounded border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
          No MTN trend data is available yet.
        </div>
      ) : (
        <div className="mt-4 overflow-hidden rounded-md bg-slate-50">
          <svg viewBox={`0 0 ${MTN_CHART_WIDTH} ${MTN_CHART_HEIGHT}`} className="h-72 w-full">
            {yAxisValues.map(value => {
              const y = MTN_CHART_HEIGHT - MTN_CHART_BOTTOM_PADDING - (value / maxValue) * (MTN_CHART_HEIGHT - MTN_CHART_PADDING - MTN_CHART_BOTTOM_PADDING);
              return (
                <g key={value}>
                  <line x1={MTN_CHART_PADDING} x2={MTN_CHART_WIDTH - MTN_CHART_PADDING} y1={y} y2={y} stroke="#e2e8f0" />
                  <text x={6} y={y + 4} className="fill-slate-400 text-[10px]">{formatMtnNumber(value)}</text>
                </g>
              );
            })}
            <line x1={MTN_CHART_PADDING} x2={MTN_CHART_WIDTH - MTN_CHART_PADDING} y1={baselineY} y2={baselineY} stroke="#cbd5e1" />
            {dateTicks.map((tick) => (
              <g key={`${tick.index}-${tick.date}`}>
                <line x1={tick.x} x2={tick.x} y1={baselineY} y2={baselineY + 4} stroke="#94a3b8" />
                <text x={tick.x} y={MTN_CHART_HEIGHT - 12} textAnchor="middle" className="fill-slate-400 text-[10px]">
                  {formatShortDate(tick.date)}
                </text>
              </g>
            ))}
            <path d={dailyPath} fill="none" stroke="#cbd5e1" strokeWidth="2" />
            <path d={averagePath} fill="none" stroke="#2563eb" strokeWidth="3" strokeLinecap="round" />
            {visibleRows.map((point, index) => {
              if (point.completedTasks > 0 || point.mtnScore > 0) return null;
              const x = MTN_CHART_PADDING + (index / Math.max(visibleRows.length - 1, 1)) * (MTN_CHART_WIDTH - MTN_CHART_PADDING * 2);
              return (
                <circle key={`no-input-${point.date}`} cx={x} cy={baselineY} r="2.4" fill="#64748b">
                  <title>{`${formatShortDate(point.date)}: 0.0 MTN, no input`}</title>
                </circle>
              );
            })}
            {visibleRows.map((point, index) => {
              if (point.mtnScore <= 0) return null;
              const x = MTN_CHART_PADDING + (index / Math.max(visibleRows.length - 1, 1)) * (MTN_CHART_WIDTH - MTN_CHART_PADDING * 2);
              const y = MTN_CHART_HEIGHT - MTN_CHART_BOTTOM_PADDING - (Math.min(point.mtnScore, maxValue) / maxValue) * (MTN_CHART_HEIGHT - MTN_CHART_PADDING - MTN_CHART_BOTTOM_PADDING);
              return (
                <circle key={`mtn-${point.date}`} cx={x} cy={y} r="2.3" fill="#2563eb">
                  <title>{`${formatShortDate(point.date)}: ${formatMtnNumber(point.mtnScore)} MTN from ${point.completedTasks} task(s). 7-day average ${formatMtnNumber(point.rollingAverage)}`}</title>
                </circle>
              );
            })}
          </svg>
        </div>
      )}
    </div>
  );
}

function TaskMtnHeatmap({ data }) {
  const days = Array.isArray(data) ? data : [];
  const weeks = [];

  days.forEach((day, index) => {
    const weekday = weekdayIndexFromDate(day.date);
    if (index === 0 || weekday === 0) {
      weeks.push([]);
    }
    weeks[weeks.length - 1].push({ ...day, weekday });
  });

  return (
    <div className="relative rounded-lg border bg-white p-4">
      <KpiInfoButton label="About the MTN heatmap">
        Shows the last 90 days of daily MTN activity. Darker green means higher MTN contribution on that day.
      </KpiInfoButton>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-800">MTN Heatmap</h2>
        <span className="text-xs text-slate-500">Last 90 days</span>
      </div>

      <div className="mt-4 overflow-x-auto pb-1">
        <div className="min-w-[360px] space-y-1">
          <div className="grid grid-cols-7 gap-1 pl-14 text-center text-[11px] text-slate-400">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(label => (
              <div key={label}>{label}</div>
            ))}
          </div>
          {weeks.map((week, weekIndex) => (
            <div key={weekIndex} className="grid grid-cols-[48px_repeat(7,1fr)] items-center gap-1">
              <div className="text-right text-[11px] text-slate-400">Week {weekIndex + 1}</div>
              {Array.from({ length: 7 }).map((_, weekday) => {
                const day = week.find(item => item.weekday === weekday);
                return day ? (
                  <div
                    key={day.date}
                    title={`${formatShortDate(day.date)}: ${formatMtnNumber(day.mtn_score)} MTN from ${day.completed_tasks || 0} completed task(s)`}
                    className={`h-4 min-w-4 rounded-sm ${colorForMtnScore(Number(day.mtn_score || 0), Number(day.completed_tasks || 0))}`}
                  />
                ) : (
                  <div key={`${weekIndex}-${weekday}`} className="h-4 min-w-4" />
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-end gap-2 text-xs text-slate-500">
        <span>No entry</span>
        <span className="h-3 w-3 rounded-sm bg-slate-100" />
        <span>Low</span>
        <span className="h-3 w-3 rounded-sm bg-rose-600" />
        <span className="h-3 w-3 rounded-sm bg-rose-300" />
        <span className="h-3 w-3 rounded-sm bg-amber-300" />
        <span className="h-3 w-3 rounded-sm bg-emerald-500" />
        <span className="h-3 w-3 rounded-sm bg-emerald-700" />
        <span>High</span>
      </div>
    </div>
  );
}

export function TaskMtnTrendsTab({ trends, loading, error }) {
  if (loading) {
    return (
      <div className="rounded-lg border bg-white p-6 text-sm text-slate-500">
        Loading MTN trends...
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700">
        {error}
      </div>
    );
  }

  const summary = trends?.summary || {};
  const today = summary.today || {};
  const last7 = summary.last_7_days || {};
  const last30 = summary.last_30_days || {};
  const last90 = summary.last_90_days || {};
  const delta = Number(last7.trend?.delta_vs_30 || 0);
  const sign = delta > 0 ? '+' : '';

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <StatTile
          label="Today"
          value={formatMtnNumber(today.mtn_score)}
          detail={`${today.completed_tasks || 0} completed task(s)`}
          info="Today's total MTN score from tasks completed today."
        />
        <StatTile
          label="Last 7 Days"
          value={formatMtnNumber(last7.average_score)}
          detail={`${formatMtnNumber(last7.total_score)} total MTN`}
          info="Average daily MTN over the last 7 days. This is the same headline MTN value used on the Executive dashboard."
        />
        <StatTile
          label="Last 30 Days"
          value={formatMtnNumber(last30.average_score)}
          detail={`${formatMtnNumber(last30.total_score)} total MTN, ${last30.active_days || 0} active day(s)`}
          info="Average daily MTN over the last 30 days. The Executive dashboard compares the 7-day average against this baseline."
        />
        <StatTile
          label="Momentum"
          value={last7.trend?.label || 'Stable'}
          detail={`${sign}${formatMtnNumber(delta)} vs 30-day avg`}
          info="The difference between the 7-day average MTN score and the 30-day average MTN score."
        />
      </div>

      <TaskMtnTrendChart data={extractTrendChart(trends)} />
      <TaskMtnHeatmap data={extractTrendChart(trends)} />

      <div className="relative rounded-lg border bg-white p-4">
        <KpiInfoButton label="About 90-day total">
          The cumulative MTN score from completed tasks over the last 90 days.
        </KpiInfoButton>
        <h2 className="text-lg font-semibold text-slate-800">90-Day Total</h2>
        <div className="mt-2 text-3xl font-semibold text-slate-900">
          {formatMtnNumber(last90.total_score)}
        </div>
        <p className="mt-1 text-sm text-slate-500">
          {last90.completed_tasks || 0} completed task(s) contributed to this score.
        </p>
      </div>

      <ProcrastinationRanking tasks={summary.procrastination_ranking || []} />
    </div>
  );
}

function ProcrastinationRanking({ tasks }) {
  const rankedTasks = Array.isArray(tasks) ? tasks : [];

  return (
    <div className="relative rounded-lg border bg-white p-4">
      <KpiInfoButton label="About procrastination ranking">
        Open tasks ranked by how often they were postponed, with MTN score used as a tie-breaker.
      </KpiInfoButton>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">Procrastination Ranking</h2>
          <p className="mt-1 text-sm text-slate-500">
            Tasks most often moved to a later due date.
          </p>
        </div>
        <div className="rounded bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">
          Top {Math.min(rankedTasks.length, 3)}
        </div>
      </div>

      {rankedTasks.length === 0 ? (
        <div className="mt-4 rounded border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
          No postponed tasks recorded yet.
        </div>
      ) : (
        <div className="mt-4 divide-y divide-slate-100">
          {rankedTasks.map((task, index) => (
            <div key={task.id} className="grid grid-cols-[2rem_1fr_auto] items-center gap-3 py-3">
              <div className="text-sm font-semibold text-slate-400">#{index + 1}</div>
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-slate-800">{task.title}</div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  {task.project && <span>{task.project}</span>}
                  {task.due_date && <span>Due {formatShortDate(dateKey(task.due_date))}</span>}
                  {task.mtn_score !== undefined && <span>MTN {formatMtnNumber(task.mtn_score)}</span>}
                  {task.status && <span className="capitalize">{task.status}</span>}
                </div>
              </div>
              <div className="rounded bg-amber-50 px-2 py-1 text-sm font-semibold text-amber-700">
                {task.times_postponed}x
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
