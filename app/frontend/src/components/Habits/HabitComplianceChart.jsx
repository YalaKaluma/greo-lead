import { useState } from 'react';

const WIDTH = 720;
const HEIGHT = 220;
const PADDING = 28;
const BOTTOM_PADDING = 42;

const OVERLAY_DEFS = {
  habits: { label: 'Habits', color: '#16a34a', unit: '%', axisMax: 100 },
  tasks: { label: 'Tasks', color: '#f97316', unit: 'MTN' },
  journal: { label: 'Journal', color: '#7c3aed', unit: 'Depth', axisMax: 10 },
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

const getOverlayConfig = (overlayKey, overlays) => {
  if (!overlayKey) return null;
  const overlayData = overlays || {};
  const series = {
    habits: (overlayData.habits || []).map(point => ({ date: dateKey(point.date), overlay_score: Number(point.compliance_rate || 0) })),
    tasks: (overlayData.tasks || []).map(point => ({ date: dateKey(point.date), overlay_score: Number(point.mtn_score || 0) })),
    journal: (overlayData.journal || []).map(point => ({
      date: dateKey(point.date),
      overlay_score: Number(point.entry_count || 0) > 0 ? Number(point.daily_average || 0) : 0,
    })),
  };
  const points = (series[overlayKey] || [])
    .filter(point => point.date)
    .sort((a, b) => dateToTime(a.date) - dateToTime(b.date));
  const values = points.map(point => Number(point.overlay_score || 0));
  const axisMax = OVERLAY_DEFS[overlayKey]?.axisMax || Math.max(1, Math.ceil(Math.max(...values, 0) * 1.2));

  return {
    axisMax,
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

export default function HabitComplianceChart({ data, overlays }) {
  const points = Array.isArray(data) ? data : [];
  const [selectedOverlay, setSelectedOverlay] = useState(null);
  const dailyPath = buildPath(points, 'compliance_rate');
  const rollingPath = buildPath(points, 'rolling_average');
  const overlayConfig = getOverlayConfig(selectedOverlay, overlays);
  const overlayPoints = selectedOverlay && overlayConfig ? overlayConfig.points : [];
  const startTime = points.length ? dateToTime(points[0].date) : null;
  const endTime = points.length ? dateToTime(points[points.length - 1].date) : null;
  const overlayDots = overlayConfig
    ? buildDateDots(overlayPoints, 'overlay_score', overlayConfig.axisMax, startTime, endTime)
    : [];
  const dateTicks = buildDateTicks(points);
  const overlayAxisValues = overlayConfig
    ? [0, overlayConfig.axisMax / 4, overlayConfig.axisMax / 2, (overlayConfig.axisMax * 3) / 4, overlayConfig.axisMax]
    : [];

  return (
    <div className="rounded-lg border bg-white p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">Compliance Trend</h2>
          <div className="mt-2 flex flex-wrap gap-4 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-slate-300" /> Daily</span>
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue-600" /> 7-day average</span>
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
          {overlayAxisValues.map(value => {
            const y = HEIGHT - BOTTOM_PADDING - (value / overlayConfig.axisMax) * (HEIGHT - PADDING - BOTTOM_PADDING);
            return (
              <text key={`overlay-axis-${value}`} x={WIDTH - PADDING + 6} y={y + 4} className="fill-slate-400 text-[10px]">
                {value.toFixed(selectedOverlay === 'journal' ? 1 : 0)}
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
          {selectedOverlay && overlayConfig && (
            <>
              <path
                d={buildDatePath(overlayPoints, 'overlay_score', overlayConfig.axisMax, startTime, endTime)}
                fill="none"
                stroke={OVERLAY_DEFS[selectedOverlay].color}
                strokeWidth="2"
                strokeLinecap="round"
                strokeDasharray="5 4"
              />
              {overlayDots.map(point => (
                <circle key={`${selectedOverlay}-${point.date}`} cx={point.x} cy={point.y} r="2.2" fill={OVERLAY_DEFS[selectedOverlay].color} />
              ))}
            </>
          )}
        </svg>
      </div>
    </div>
  );
}
