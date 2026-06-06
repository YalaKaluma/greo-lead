import { useState } from 'react';

const WIDTH = 720;
const HEIGHT = 220;
const PADDING = 28;
const BOTTOM_PADDING = 42;

const OVERLAY_DEFS = {
  habits: { label: 'Habits', color: '#16a34a' },
  tasks: { label: 'Tasks', color: '#f97316' },
  journal: { label: 'Journal', color: '#7c3aed' },
};

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

const normalizeOverlayPoints = (basePoints, overlays) => {
  const overlayData = overlays || {};
  const taskValues = (overlayData.tasks || []).map(point => Number(point.mtn_score || 0));
  const maxTask = Math.max(...taskValues, 0);
  const byDate = {
    habits: new Map((overlayData.habits || []).map(point => [point.date, Number(point.compliance_rate || 0)])),
    tasks: new Map((overlayData.tasks || []).map(point => [
      point.date,
      maxTask > 0 ? (Number(point.mtn_score || 0) / maxTask) * 100 : 0
    ])),
    journal: new Map((overlayData.journal || []).map(point => [
      point.date,
      Number(point.entry_count || 0) > 0 ? Math.min(Number(point.daily_average || 0) * 10, 100) : 0
    ])),
  };

  return Object.fromEntries(
    Object.keys(OVERLAY_DEFS).map(key => [
      key,
      basePoints.map(point => ({
        date: point.date,
        overlay_score: byDate[key].get(point.date) ?? 0,
      })),
    ])
  );
};

function OverlayButtons({ selected, onToggle }) {
  return (
    <div className="flex flex-wrap justify-end gap-2">
      {Object.entries(OVERLAY_DEFS).map(([key, item]) => (
        <button
          key={key}
          type="button"
          onClick={() => onToggle(key)}
          className={`rounded-md border px-2.5 py-1 text-xs font-semibold transition-colors ${
            selected.includes(key)
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

export default function HabitComplianceChart({ data, overlays }) {
  const points = Array.isArray(data) ? data : [];
  const [selectedOverlays, setSelectedOverlays] = useState([]);
  const dailyPath = buildPath(points, 'compliance_rate');
  const rollingPath = buildPath(points, 'rolling_average');
  const overlayPoints = normalizeOverlayPoints(points, overlays);
  const dateTicks = buildDateTicks(points);
  const toggleOverlay = (key) => {
    setSelectedOverlays(current =>
      current.includes(key) ? current.filter(item => item !== key) : [...current, key]
    );
  };

  return (
    <div className="rounded-lg border bg-white p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">Compliance Trend</h2>
          <div className="mt-2 flex flex-wrap gap-4 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-slate-300" /> Daily</span>
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue-600" /> 7-day average</span>
            {selectedOverlays.map(key => (
              <span key={key} className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: OVERLAY_DEFS[key].color }} />
                {OVERLAY_DEFS[key].label}
              </span>
            ))}
          </div>
        </div>
        <OverlayButtons selected={selectedOverlays} onToggle={toggleOverlay} />
      </div>

      <div className="mt-4 overflow-hidden rounded-md bg-slate-50">
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="h-64 w-full">
          {[0, 25, 50, 75, 100].map(value => {
            const y = HEIGHT - BOTTOM_PADDING - (value / 100) * (HEIGHT - PADDING - BOTTOM_PADDING);
            return (
              <g key={value}>
                <line x1={PADDING} x2={WIDTH - PADDING} y1={y} y2={y} stroke="#e2e8f0" />
                <text x={6} y={y + 4} className="fill-slate-400 text-[10px]">{value}%</text>
                <text x={WIDTH - PADDING + 6} y={y + 4} className="fill-slate-400 text-[10px]">{value}</text>
              </g>
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
          {selectedOverlays.map(key => (
            <path
              key={key}
              d={buildPath(overlayPoints[key] || [], 'overlay_score')}
              fill="none"
              stroke={OVERLAY_DEFS[key].color}
              strokeWidth="2"
              strokeLinecap="round"
              strokeDasharray="5 4"
            />
          ))}
        </svg>
      </div>
    </div>
  );
}
