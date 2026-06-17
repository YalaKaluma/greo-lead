import { addDays, dateFromKey, dateKey, dateToTime, formatDateKey } from './todoDateLogic.js';

export const MTN_CHART_WIDTH = 720;
export const MTN_CHART_HEIGHT = 240;
export const MTN_CHART_PADDING = 34;
export const MTN_CHART_BOTTOM_PADDING = 46;

export const MTN_BRACKET_COLORS = {
  Low: '#DC2626',
  Base: '#F97316',
  Good: '#FACC15',
  Strong: '#84CC16',
  Peak: '#16A34A',
};

export const STATIC_MTN_SEGMENTS = [
  { label: 'Low', start: 0, end: 4, range: 4, color: MTN_BRACKET_COLORS.Low },
  { label: 'Base', start: 4, end: 8, range: 4, color: MTN_BRACKET_COLORS.Base },
  { label: 'Good', start: 8, end: 12, range: 4, color: MTN_BRACKET_COLORS.Good },
  { label: 'Strong', start: 12, end: 16, range: 4, color: MTN_BRACKET_COLORS.Strong },
  { label: 'Peak', start: 16, end: 20, range: 4, color: MTN_BRACKET_COLORS.Peak },
];

export const extractTrendChart = (payload) => {
  if (Array.isArray(payload)) return payload;
  const candidates = [
    payload?.trend_chart,
    payload?.trendChart,
    payload?.data?.trend_chart,
    payload?.data?.trendChart,
    payload?.trends?.trend_chart,
    payload?.trends?.trendChart,
  ];
  return candidates.find(Array.isArray) || [];
};

export function formatMtnNumber(value) {
  const numeric = Number(value || 0);
  return numeric.toFixed(1);
}

export const buildDailyMtnBenchmark = (mtnTrends) => {
  const todayDate = mtnTrends?.summary?.today?.date;
  const rows = extractTrendChart(mtnTrends)
    .map(row => ({
      date: dateKey(row.date),
      mtnScore: Number(row.mtn_score ?? row.mtnScore ?? 0),
      completedTasks: Number(row.completed_tasks ?? row.completedTasks ?? 0),
    }))
    .filter(row => row.date);

  const previousRows = todayDate
    ? rows.filter(row => row.date < todayDate)
    : rows.slice(0, -1);
  const historyRows = previousRows.slice(-30);
  const activeHistoryDays = historyRows.filter(row => row.completedTasks > 0 || row.mtnScore > 0).length;

  if (activeHistoryDays < 7) {
    return {
      isDynamic: false,
      avgMtn: 0,
      effectiveMax: 20,
      activeHistoryDays,
      segments: STATIC_MTN_SEGMENTS,
    };
  }

  const dailyScores = historyRows.map(row => row.mtnScore);
  const avgMtn = dailyScores.reduce((sum, value) => sum + value, 0) / Math.max(dailyScores.length, 1);
  const maxMtn = Math.max(...dailyScores, 0);
  const effectiveMax = Math.max(maxMtn, avgMtn + 5, 1);
  const range = effectiveMax - avgMtn;
  const boundaries = [
    0,
    avgMtn * 0.5,
    avgMtn,
    avgMtn + range * 0.33,
    avgMtn + range * 0.66,
    effectiveMax,
  ];
  const labels = ['Low', 'Base', 'Good', 'Strong', 'Peak'];
  const segments = labels.map((label, index) => {
    const start = boundaries[index];
    const end = Math.max(boundaries[index + 1], start);
    return {
      label,
      start,
      end,
      range: Math.max(end - start, 0.1),
      color: MTN_BRACKET_COLORS[label],
    };
  });

  return {
    isDynamic: true,
    avgMtn,
    maxMtn,
    effectiveMax,
    activeHistoryDays,
    segments,
  };
};

export const describeMtnAverageComparison = (score, average) => {
  const numericScore = Number(score || 0);
  const numericAverage = Number(average || 0);
  if (numericAverage <= 0) return 'Your 30-day average is still forming';

  const percent = Math.round(((numericScore - numericAverage) / numericAverage) * 100);
  if (percent > 0) return `${percent}% above your 30-day average`;
  if (percent < 0) return `${Math.abs(percent)}% below your 30-day average`;
  return 'Right at your 30-day average';
};

export const fillMtnTrendDates = (rows) => {
  const sortedRows = [...rows].sort((a, b) => dateToTime(a.date) - dateToTime(b.date));
  const firstDate = dateFromKey(sortedRows[0]?.date);
  const lastDate = dateFromKey(sortedRows[sortedRows.length - 1]?.date);
  if (!firstDate || !lastDate) return sortedRows;

  const rowsByDate = new Map(sortedRows.map(row => [row.date, row]));
  const filled = [];

  for (let cursor = firstDate; cursor <= lastDate; cursor = addDays(cursor, 1)) {
    const currentKey = formatDateKey(cursor);
    filled.push(rowsByDate.get(currentKey) || {
      date: currentKey,
      mtnScore: 0,
      rollingAverage: 0,
      completedTasks: 0,
    });
  }

  return filled.map((row, index) => {
    const rollingValues = filled.slice(Math.max(0, index - 6), index + 1).map(item => Number(item.mtnScore || 0));
    const rollingAverage = rollingValues.reduce((sum, value) => sum + value, 0) / Math.max(rollingValues.length, 1);
    return {
      ...row,
      rollingAverage,
    };
  });
};

export const buildMtnDateTicks = (points) => {
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
      x: MTN_CHART_PADDING + (pointIndex / Math.max(points.length - 1, 1)) * (MTN_CHART_WIDTH - MTN_CHART_PADDING * 2),
    }));
};

export const buildMtnTrendPath = (points, key, maxValue) => {
  if (!points.length || !maxValue) return '';
  return points
    .map((point, index) => {
      const x = MTN_CHART_PADDING + (index / Math.max(points.length - 1, 1)) * (MTN_CHART_WIDTH - MTN_CHART_PADDING * 2);
      const value = Math.max(0, Math.min(Number(point[key]) || 0, maxValue));
      const y = MTN_CHART_HEIGHT - MTN_CHART_BOTTOM_PADDING - (value / maxValue) * (MTN_CHART_HEIGHT - MTN_CHART_PADDING - MTN_CHART_BOTTOM_PADDING);
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');
};

export const weekdayIndexFromDate = (dateString) => {
  const [year, month, day] = dateString.split('-').map(Number);
  const jsDay = new Date(year, month - 1, day).getDay();
  return (jsDay + 6) % 7;
};

export const colorForMtnScore = (score, completedTasks) => {
  if (!completedTasks) return 'bg-slate-100';
  if (score >= 20) return 'bg-emerald-700';
  if (score >= 15) return 'bg-emerald-500';
  if (score >= 10) return 'bg-amber-300';
  if (score >= 5) return 'bg-rose-300';
  return 'bg-rose-600';
};
