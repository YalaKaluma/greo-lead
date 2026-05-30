const WIDTH = 720;
const HEIGHT = 220;
const PADDING = 28;

const buildPath = (points, key) => {
  if (!points.length) return '';
  return points
    .map((point, index) => {
      const x = PADDING + (index / Math.max(points.length - 1, 1)) * (WIDTH - PADDING * 2);
      const y = HEIGHT - PADDING - ((point[key] || 0) / 100) * (HEIGHT - PADDING * 2);
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');
};

export default function HabitComplianceChart({ data }) {
  const points = Array.isArray(data) ? data : [];
  const dailyPath = buildPath(points, 'compliance_rate');
  const rollingPath = buildPath(points, 'rolling_average');

  return (
    <div className="rounded-lg border bg-white p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-800">Compliance Trend</h2>
        <div className="flex gap-4 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-slate-300" /> Daily</span>
          <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue-600" /> 7-day average</span>
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-md bg-slate-50">
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="h-64 w-full">
          {[0, 25, 50, 75, 100].map(value => {
            const y = HEIGHT - PADDING - (value / 100) * (HEIGHT - PADDING * 2);
            return (
              <g key={value}>
                <line x1={PADDING} x2={WIDTH - PADDING} y1={y} y2={y} stroke="#e2e8f0" />
                <text x={6} y={y + 4} className="fill-slate-400 text-[10px]">{value}%</text>
              </g>
            );
          })}
          <path d={dailyPath} fill="none" stroke="#cbd5e1" strokeWidth="2" />
          <path d={rollingPath} fill="none" stroke="#2563eb" strokeWidth="3" strokeLinecap="round" />
        </svg>
      </div>
    </div>
  );
}
