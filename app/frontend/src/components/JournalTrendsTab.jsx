const WIDTH = 720;
const HEIGHT = 240;
const PADDING = 32;

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
      const y = HEIGHT - PADDING - ((Number(point[key]) - 1) / 9) * (HEIGHT - PADDING * 2);
      return `${pathIndex === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');
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

function DepthTrendChart({ data }) {
  const points = Array.isArray(data) ? data : [];
  const dailyPath = buildPath(points, 'daily_average');
  const weeklyPath = buildPath(points, 'weekly_average');
  const rollingPath = buildPath(points, 'rolling_30_day_average');

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-800">Reflection Depth Trend</h2>
        <div className="flex flex-wrap gap-4 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-slate-300" /> Daily</span>
          <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue-600" /> Weekly</span>
          <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-600" /> 30-day</span>
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-md bg-slate-50">
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="h-72 w-full">
          {[1, 3, 5, 7, 9, 10].map((value) => {
            const y = HEIGHT - PADDING - ((value - 1) / 9) * (HEIGHT - PADDING * 2);
            return (
              <g key={value}>
                <line x1={PADDING} x2={WIDTH - PADDING} y1={y} y2={y} stroke="#e2e8f0" />
                <text x={6} y={y + 4} className="fill-slate-400 text-[10px]">{value}</text>
              </g>
            );
          })}
          <path d={dailyPath} fill="none" stroke="#cbd5e1" strokeWidth="2" />
          <path d={weeklyPath} fill="none" stroke="#2563eb" strokeWidth="3" strokeLinecap="round" />
          <path d={rollingPath} fill="none" stroke="#059669" strokeWidth="3" strokeLinecap="round" />
        </svg>
      </div>
    </div>
  );
}

export default function JournalTrendsTab({ trends, loading, error }) {
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

      <DepthTrendChart data={trends?.trend_chart} />

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
