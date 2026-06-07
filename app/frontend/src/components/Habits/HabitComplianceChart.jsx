const WIDTH = 720;
const HEIGHT = 220;
const PADDING = 28;
const BOTTOM_PADDING = 42;

const ENERGY_AXIS_MAX = 5;
const ENERGY_COLOR = '#0f766e';

const buildPath = (points, key) => {
  if (!points.length) return '';
  return points
    .map((point, index) => {
      const x = PADDING + (index / Math.max(points.length - 1, 1)) * (WIDTH - PADDING * 2);
      const y = HEIGHT - BOTTOM_PADDING - ((point[key] || 0) / 100) * (HEIGHT - PADDING - BOTTOM_PADDING);
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');
};

const dateKey = (dateString) => {
  const match = String(dateString || '').match(/\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : '';
};

const dateToTime = (dateString) => {
  const [year, month, day] = dateKey(dateString).split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day).getTime();
};

const buildDatePath = (points, key, maxValue, startTime, endTime) => {
  if (!points.length || !maxValue || startTime === null || endTime === null) return '';
  const range = Math.max(endTime - startTime, 1);
  const plotted = points
    .map(point => {
      const pointTime = dateToTime(point.date);
      if (pointTime === null || pointTime < startTime || pointTime > endTime) return null;
      const x = PADDING + ((pointTime - startTime) / range) * (WIDTH - PADDING * 2);
      const scaledValue = Math.min(Number(point[key]) || 0, maxValue);
      const y = HEIGHT - BOTTOM_PADDING - (scaledValue / maxValue) * (HEIGHT - PADDING - BOTTOM_PADDING);
      return { x, y };
    })
    .filter(Boolean)
  return plotted
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
    .join(' ');
};

const buildDateDots = (points, key, maxValue, startTime, endTime) => {
  if (!points.length || !maxValue || startTime === null || endTime === null) return [];
  const range = Math.max(endTime - startTime, 1);
  return points
    .map(point => {
      const pointTime = dateToTime(point.date);
      if (pointTime === null || pointTime < startTime || pointTime > endTime) return null;
      const x = PADDING + ((pointTime - startTime) / range) * (WIDTH - PADDING * 2);
      const scaledValue = Math.min(Number(point[key]) || 0, maxValue);
      const y = HEIGHT - BOTTOM_PADDING - (scaledValue / maxValue) * (HEIGHT - PADDING - BOTTOM_PADDING);
      return { ...point, x, y, value: Number(point[key]) || 0 };
    })
    .filter(point => point && point.value > 0);
};

const formatShortDate = (dateString) => {
  if (!dateString) return '';
  const date = new Date(`${dateString}T00:00:00`);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
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

const getEnergyPoints = (energyData) => (Array.isArray(energyData) ? energyData : [])
  .map(point => ({
    date: dateKey(point.date),
    energyLevel: point.energy_level === null || point.energy_level === undefined ? 0 : Number(point.energy_level || 0),
  }))
  .filter(point => point.date)
  .sort((a, b) => dateToTime(a.date) - dateToTime(b.date));

export default function HabitComplianceChart({ data, energyData }) {
  const points = Array.isArray(data) ? data : [];
  const dailyPath = buildPath(points, 'compliance_rate');
  const rollingPath = buildPath(points, 'rolling_average');
  const energyPoints = getEnergyPoints(energyData);
  const startTime = points.length ? dateToTime(points[0].date) : null;
  const endTime = points.length ? dateToTime(points[points.length - 1].date) : null;
  const energyDots = buildDateDots(energyPoints, 'energyLevel', ENERGY_AXIS_MAX, startTime, endTime);
  const dateTicks = buildDateTicks(points);
  const energyAxisValues = [0, 1, 2, 3, 4, 5];

  return (
    <div className="rounded-lg border bg-white p-4">
      <div>
        <div>
          <h2 className="text-lg font-semibold text-slate-800">Compliance Trend</h2>
          <div className="mt-2 flex flex-wrap gap-4 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-slate-300" /> Daily</span>
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue-600" /> 7-day average</span>
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: ENERGY_COLOR }} /> Energy</span>
          </div>
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-md bg-slate-50">
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="h-64 w-full">
          {[0, 25, 50, 75, 100].map(value => {
            const y = HEIGHT - BOTTOM_PADDING - (value / 100) * (HEIGHT - PADDING - BOTTOM_PADDING);
            return (
              <g key={value}>
                <line x1={PADDING} x2={WIDTH - PADDING} y1={y} y2={y} stroke="#e2e8f0" />
                <text x={6} y={y + 4} className="fill-slate-400 text-[10px]">{value}%</text>
              </g>
            );
          })}
          {energyAxisValues.map(value => {
            const y = HEIGHT - BOTTOM_PADDING - (value / ENERGY_AXIS_MAX) * (HEIGHT - PADDING - BOTTOM_PADDING);
            return (
              <text key={`energy-axis-${value}`} x={WIDTH - PADDING + 6} y={y + 4} className="fill-slate-400 text-[10px]">
                {value}
              </text>
            );
          })}
          <line x1={PADDING} x2={WIDTH - PADDING} y1={HEIGHT - BOTTOM_PADDING} y2={HEIGHT - BOTTOM_PADDING} stroke="#cbd5e1" />
          <line x1={WIDTH - PADDING} x2={WIDTH - PADDING} y1={PADDING} y2={HEIGHT - BOTTOM_PADDING} stroke="#cbd5e1" />
          {dateTicks.map((tick) => (
            <g key={`${tick.index}-${tick.date}`}>
              <line x1={tick.x} x2={tick.x} y1={HEIGHT - BOTTOM_PADDING} y2={HEIGHT - BOTTOM_PADDING + 4} stroke="#94a3b8" />
              <text x={tick.x} y={HEIGHT - 12} textAnchor="middle" className="fill-slate-400 text-[10px]">
                {formatShortDate(tick.date)}
              </text>
            </g>
          ))}
          <path d={dailyPath} fill="none" stroke="#cbd5e1" strokeWidth="2" />
          <path d={rollingPath} fill="none" stroke="#2563eb" strokeWidth="3" strokeLinecap="round" />
          <path
            d={buildDatePath(energyPoints, 'energyLevel', ENERGY_AXIS_MAX, startTime, endTime)}
            fill="none"
            stroke={ENERGY_COLOR}
            strokeWidth="2"
            strokeLinecap="round"
            strokeDasharray="5 4"
          />
          {energyDots.map(point => (
            <circle key={`energy-${point.date}`} cx={point.x} cy={point.y} r="2.2" fill={ENERGY_COLOR} />
          ))}
        </svg>
      </div>
    </div>
  );
}
