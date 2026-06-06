import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';

const WIDTH = 720;
const HEIGHT = 240;
const PADDING = 32;

const OVERLAY_DEFS = {
  habits: { label: 'Habits', color: '#16a34a', unit: '%', axisMax: 100 },
  tasks: { label: 'Tasks', color: '#f97316', unit: 'MTN' },
  journal: { label: 'Journal', color: '#7c3aed', unit: 'Depth', axisMax: 10 },
};

const formatShortDate = (dateString) => {
  if (!dateString) return '';
  const date = new Date(`${dateString}T00:00:00`);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const formatNumber = (value, fallback = '-') => {
  if (value === null || value === undefined) return fallback;
  return Number(value).toFixed(1);
};

const buildPath = (points, key) => {
  const valid = points
    .map((point, index) => ({ ...point, index }))
    .filter((point) => point[key] !== null && point[key] !== undefined);

  if (!valid.length) return '';

  return valid
    .map((point, pathIndex) => {
      const x = PADDING + (point.index / Math.max(points.length - 1, 1)) * (WIDTH - PADDING * 2);
      const y = HEIGHT - PADDING - (Number(point[key]) / 10) * (HEIGHT - PADDING * 2);
      return `${pathIndex === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');
};

const dateToTime = (dateString) => {
  const [year, month, day] = String(dateString || '').split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day).getTime();
};

const buildDatePath = (points, key, maxValue, startTime, endTime) => {
  if (!points.length || !maxValue || startTime === null || endTime === null) return '';
  const range = Math.max(endTime - startTime, 1);
  return points
    .map(point => {
      const pointTime = dateToTime(point.date);
      if (pointTime === null || pointTime < startTime || pointTime > endTime) return null;
      const x = PADDING + ((pointTime - startTime) / range) * (WIDTH - PADDING * 2);
      const scaledValue = Math.min(Number(point[key]) || 0, maxValue);
      const y = HEIGHT - PADDING - (scaledValue / maxValue) * (HEIGHT - PADDING * 2);
      return { x, y };
    })
    .filter(Boolean)
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
    .join(' ');
};

const buildDateTicks = (points) => {
  if (!points.length) return [];
  const tickCount = Math.min(6, points.length);
  const used = new Set();

  return Array.from({ length: tickCount })
    .map((_, index) => Math.round((index / Math.max(tickCount - 1, 1)) * (points.length - 1)))
    .filter((pointIndex) => {
      if (used.has(pointIndex)) return false;
      used.add(pointIndex);
      return true;
    })
    .map((pointIndex) => ({
      index: pointIndex,
      date: points[pointIndex]?.date,
      x: PADDING + (pointIndex / Math.max(points.length - 1, 1)) * (WIDTH - PADDING * 2),
    }));
};

const weekdayIndexFromDate = (dateString) => {
  const date = new Date(`${dateString}T00:00:00`);
  return (date.getDay() + 6) % 7;
};

const colorForDepth = (score, entryCount) => {
  if (!entryCount || score === null || score === undefined) return 'bg-slate-100';
  if (score >= 8) return 'bg-emerald-700';
  if (score >= 6.5) return 'bg-emerald-500';
  if (score >= 5) return 'bg-amber-300';
  if (score >= 3) return 'bg-rose-300';
  return 'bg-rose-600';
};

function KpiCard({ label, value, detail, tone = 'slate' }) {
  const toneClass = tone === 'green' ? 'text-emerald-700' : tone === 'blue' ? 'text-blue-700' : 'text-slate-900';

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="text-sm font-medium text-slate-500">{label}</div>
      <div className={`mt-2 text-3xl font-bold ${toneClass}`}>{value}</div>
      {detail && <div className="mt-2 text-xs text-slate-500">{detail}</div>}
    </div>
  );
}

const getOverlayConfig = (overlayKey, overlays) => {
  if (!overlayKey) return null;
  const overlayData = overlays || {};
  const series = {
    habits: (overlayData.habits || []).map(point => ({ date: point.date, overlay_score: Number(point.compliance_rate || 0) })),
    tasks: (overlayData.tasks || []).map(point => ({ date: point.date, overlay_score: Number(point.mtn_score || 0) })),
    journal: (overlayData.journal || []).map(point => ({
      date: point.date,
      overlay_score: Number(point.entry_count || 0) > 0 ? Number(point.daily_average || 0) : 0,
    })),
  };
  const points = series[overlayKey] || [];
  const values = points.map(point => Number(point.overlay_score || 0));

  return {
    axisMax: OVERLAY_DEFS[overlayKey]?.axisMax || Math.max(1, Math.ceil(Math.max(...values, 0) * 1.2)),
    points,
  };
};

function OverlayButtons({ selected, onSelect }) {
  return (
    <div className="flex flex-wrap justify-end gap-2">
      {Object.entries(OVERLAY_DEFS).map(([key, item]) => (
        <button
          key={key}
          type="button"
          onClick={() => onSelect(selected === key ? null : key)}
          className={`rounded-md border px-2.5 py-1 text-xs font-semibold transition-colors ${
            selected === key
              ? 'border-slate-700 bg-slate-900 text-white'
              : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
          }`}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

function DepthTrendChart({ data, overlays }) {
  const points = (Array.isArray(data) ? data : []).map(point => ({
    ...point,
    daily_plot_score: Number(point.entry_count || 0) > 0 ? point.daily_average : 0,
  }));
  const [selectedOverlay, setSelectedOverlay] = useState(null);
  const dailyPath = buildPath(points, 'daily_plot_score');
  const weeklyPath = buildPath(points, 'weekly_average');
  const rollingPath = buildPath(points, 'rolling_30_day_average');
  const dateTicks = buildDateTicks(points);
  const overlayConfig = getOverlayConfig(selectedOverlay, overlays);
  const overlayPoints = selectedOverlay && overlayConfig ? overlayConfig.points : [];
  const startTime = points.length ? dateToTime(points[0].date) : null;
  const endTime = points.length ? dateToTime(points[points.length - 1].date) : null;
  const overlayAxisValues = overlayConfig
    ? [0, overlayConfig.axisMax / 4, overlayConfig.axisMax / 2, (overlayConfig.axisMax * 3) / 4, overlayConfig.axisMax]
    : [];

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">Reflection Depth Trend</h2>
          <div className="mt-2 flex flex-wrap gap-4 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-slate-300" /> Daily</span>
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-slate-500" /> No input</span>
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue-600" /> Weekly</span>
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-600" /> 30-day</span>
            {selectedOverlay && (
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: OVERLAY_DEFS[selectedOverlay].color }} />
                {OVERLAY_DEFS[selectedOverlay].label}
              </span>
            )}
          </div>
        </div>
        <OverlayButtons selected={selectedOverlay} onSelect={setSelectedOverlay} />
      </div>

      <div className="mt-4 overflow-hidden rounded-md bg-slate-50">
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="h-72 w-full">
          {[0, 2, 4, 6, 8, 10].map((value) => {
            const y = HEIGHT - PADDING - (value / 10) * (HEIGHT - PADDING * 2);
            return (
              <g key={value}>
                <line x1={PADDING} x2={WIDTH - PADDING} y1={y} y2={y} stroke="#e2e8f0" />
                <text x={6} y={y + 4} className="fill-slate-400 text-[10px]">{value}</text>
              </g>
            );
          })}
          {overlayAxisValues.map(value => {
            const y = HEIGHT - PADDING - (value / overlayConfig.axisMax) * (HEIGHT - PADDING * 2);
            return (
              <text key={`overlay-axis-${value}`} x={WIDTH - PADDING + 6} y={y + 4} className="fill-slate-400 text-[10px]">
                {value.toFixed(selectedOverlay === 'journal' ? 1 : 0)}
              </text>
            );
          })}
          <line x1={PADDING} x2={WIDTH - PADDING} y1={HEIGHT - PADDING} y2={HEIGHT - PADDING} stroke="#cbd5e1" />
          <line x1={WIDTH - PADDING} x2={WIDTH - PADDING} y1={PADDING} y2={HEIGHT - PADDING} stroke="#cbd5e1" />
          {dateTicks.map((tick) => (
            <g key={`${tick.index}-${tick.date}`}>
              <line x1={tick.x} x2={tick.x} y1={HEIGHT - PADDING} y2={HEIGHT - PADDING + 4} stroke="#94a3b8" />
              <text
                x={tick.x}
                y={HEIGHT - 10}
                textAnchor="middle"
                className="fill-slate-400 text-[10px]"
              >
                {formatShortDate(tick.date)}
              </text>
            </g>
          ))}
          <path d={dailyPath} fill="none" stroke="#cbd5e1" strokeWidth="2" />
          <path d={weeklyPath} fill="none" stroke="#2563eb" strokeWidth="3" strokeLinecap="round" />
          <path d={rollingPath} fill="none" stroke="#059669" strokeWidth="3" strokeLinecap="round" />
          {points.map((point, index) => {
            if (Number(point.entry_count || 0) > 0) return null;
            const x = PADDING + (index / Math.max(points.length - 1, 1)) * (WIDTH - PADDING * 2);
            const y = HEIGHT - PADDING;
            return (
              <circle key={`no-input-${point.date}`} cx={x} cy={y} r="2.5" fill="#64748b">
                <title>{`${formatShortDate(point.date)}: no input`}</title>
              </circle>
            );
          })}
          {selectedOverlay && overlayConfig && (
            <path
              d={buildDatePath(overlayPoints, 'overlay_score', overlayConfig.axisMax, startTime, endTime)}
              fill="none"
              stroke={OVERLAY_DEFS[selectedOverlay].color}
              strokeWidth="2"
              strokeLinecap="round"
              strokeDasharray="5 4"
            />
          )}
        </svg>
      </div>
    </div>
  );
}

function ReflectionDepthHeatmap({ data }) {
  const days = (Array.isArray(data) ? data : []).map((day) => ({
    ...day,
    weekday: weekdayIndexFromDate(day.date),
  }));
  const weeks = [];

  days.forEach((day, index) => {
    if (index === 0 || day.weekday === 0) {
      weeks.push([]);
    }
    weeks[weeks.length - 1].push(day);
  });

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-800">Reflection Depth Heatmap</h2>
        <span className="text-xs text-slate-500">Last 90 days</span>
      </div>

      <div className="mt-4 overflow-x-auto pb-1">
        <div className="min-w-[420px] space-y-1">
          <div className="grid grid-cols-7 gap-1 pl-14 text-center text-[11px] text-slate-400">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((label) => (
              <div key={label}>{label}</div>
            ))}
          </div>
          {weeks.map((week, weekIndex) => (
            <div key={weekIndex} className="grid grid-cols-[48px_repeat(7,1fr)] items-center gap-1">
              <div className="text-right text-[11px] text-slate-400">Week {weekIndex + 1}</div>
              {Array.from({ length: 7 }).map((_, weekday) => {
                const day = week.find((item) => item.weekday === weekday);
                if (!day) {
                  return <div key={`${weekIndex}-${weekday}`} className="h-4 min-w-4" />;
                }

                const score = day.daily_average;
                const label = !day.entry_count
                  ? 'No input'
                  : `${formatNumber(score)} depth score from ${day.entry_count} entr${day.entry_count === 1 ? 'y' : 'ies'}`;

                return (
                  <div
                    key={day.date}
                    title={`${formatShortDate(day.date)}: ${label}`}
                    className={`h-4 min-w-4 rounded-sm ${colorForDepth(score, day.entry_count)}`}
                  />
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

export default function JournalTrendsTab({ apiUrl, userNumber, trends, loading, error }) {
  const [overlayTrends, setOverlayTrends] = useState({ habits: [], tasks: [] });

  useEffect(() => {
    if (!apiUrl || !userNumber) return;
    let cancelled = false;

    const fetchOverlays = async () => {
      try {
        const [habitsResponse, tasksResponse] = await Promise.allSettled([
          axios.get(`${apiUrl}/api/habits/trends`, { params: { user_number: userNumber } }),
          axios.get(`${apiUrl}/api/tasks/mtn-trends`, { params: { user_number: userNumber } }),
        ]);
        if (cancelled) return;
        setOverlayTrends({
          habits: habitsResponse.status === 'fulfilled' ? habitsResponse.value.data?.trend_chart || [] : [],
          tasks: tasksResponse.status === 'fulfilled' ? tasksResponse.value.data?.trend_chart || [] : [],
        });
      } catch (fetchError) {
        if (!cancelled) setOverlayTrends({ habits: [], tasks: [] });
      }
    };

    fetchOverlays();
    return () => {
      cancelled = true;
    };
  }, [apiUrl, userNumber]);

  const overlays = useMemo(() => ({
    habits: overlayTrends.habits,
    tasks: overlayTrends.tasks,
    journal: trends?.trend_chart || [],
  }), [overlayTrends, trends]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-slate-500">
        Loading reflection trends...
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
        {error}
      </div>
    );
  }

  const summary = trends?.summary || {};
  const average = summary.average_reflection_depth || {};
  const trend = average.trend || 0;
  const sign = trend > 0 ? '+' : '';
  const coaching = trends?.coaching || {};
  const recommendations = Array.isArray(coaching.recommendations) ? coaching.recommendations : [];

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        <KpiCard
          label="Average Reflection Depth"
          value={formatNumber(average.current)}
          detail={`Previous 30 days: ${formatNumber(average.previous_30_days)} | Trend: ${sign}${formatNumber(trend, '0.0')}`}
          tone={trend > 0 ? 'green' : 'slate'}
        />
        <KpiCard
          label="Deep Reflection Entries"
          value={summary.deep_reflection_entries || 0}
          detail="Entries scored 8+"
          tone="blue"
        />
        <KpiCard
          label="Total Journal Entries"
          value={summary.total_journal_entries || 0}
          detail="Scored reflections"
        />
      </div>

      <DepthTrendChart data={trends?.trend_chart} overlays={overlays} />
      <ReflectionDepthHeatmap data={trends?.trend_chart} />

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-lg font-semibold text-slate-800">Alfred Reflection Coach</h2>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          {coaching.summary || 'Write a few scored journal entries and Alfred will identify your strongest reflection patterns.'}
        </p>

        {recommendations.length > 0 && (
          <div className="mt-4 grid gap-2 md:grid-cols-3">
            {recommendations.map((item, index) => (
              <div key={index} className="rounded-md bg-slate-50 p-3 text-sm text-slate-700">
                {item}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
