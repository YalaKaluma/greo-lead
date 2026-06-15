import { describe, expect, it } from 'vitest';
import {
  buildDailyMtnBenchmark,
  buildMtnDateTicks,
  buildMtnTrendPath,
  colorForMtnScore,
  describeMtnAverageComparison,
  extractTrendChart,
  fillMtnTrendDates,
  formatMtnNumber,
  STATIC_MTN_SEGMENTS,
  weekdayIndexFromDate,
} from './todoMtnTrends';

describe('todoMtnTrends payload helpers', () => {
  it('finds trend chart arrays across supported payload shapes', () => {
    const rows = [{ date: '2026-06-15' }];

    expect(extractTrendChart(rows)).toBe(rows);
    expect(extractTrendChart({ trend_chart: rows })).toBe(rows);
    expect(extractTrendChart({ data: { trendChart: rows } })).toBe(rows);
    expect(extractTrendChart({ trends: { trend_chart: rows } })).toBe(rows);
    expect(extractTrendChart({ nope: rows })).toEqual([]);
  });

  it('formats MTN numbers consistently for summary and chart labels', () => {
    expect(formatMtnNumber(7)).toBe('7.0');
    expect(formatMtnNumber('7.26')).toBe('7.3');
    expect(formatMtnNumber(undefined)).toBe('0.0');
  });
});

describe('todoMtnTrends benchmark logic', () => {
  it('uses the static benchmark until there are seven active history days', () => {
    const benchmark = buildDailyMtnBenchmark({
      summary: { today: { date: '2026-06-10' } },
      trend_chart: [
        { date: '2026-06-01', mtn_score: 3, completed_tasks: 1 },
        { date: '2026-06-02', mtn_score: 0, completed_tasks: 0 },
      ],
    });

    expect(benchmark).toMatchObject({
      isDynamic: false,
      effectiveMax: 20,
      activeHistoryDays: 1,
      segments: STATIC_MTN_SEGMENTS,
    });
  });

  it('builds dynamic benchmark segments from recent active history excluding today', () => {
    const trend_chart = Array.from({ length: 8 }, (_, index) => ({
      date: `2026-06-${String(index + 1).padStart(2, '0')}`,
      mtn_score: index + 3,
      completed_tasks: 1,
    })).concat([{ date: '2026-06-09', mtn_score: 99, completed_tasks: 3 }]);

    const benchmark = buildDailyMtnBenchmark({
      summary: { today: { date: '2026-06-09' } },
      trend_chart,
    });

    expect(benchmark.isDynamic).toBe(true);
    expect(benchmark.activeHistoryDays).toBe(8);
    expect(benchmark.maxMtn).toBe(10);
    expect(benchmark.segments.map(segment => segment.label)).toEqual(['Low', 'Base', 'Good', 'Strong', 'Peak']);
  });

  it('describes comparison against the 30-day average', () => {
    expect(describeMtnAverageComparison(12, 10)).toBe('20% above your 30-day average');
    expect(describeMtnAverageComparison(8, 10)).toBe('20% below your 30-day average');
    expect(describeMtnAverageComparison(10, 10)).toBe('Right at your 30-day average');
    expect(describeMtnAverageComparison(10, 0)).toBe('Your 30-day average is still forming');
  });
});

describe('todoMtnTrends chart helpers', () => {
  it('fills missing trend dates and recalculates rolling averages', () => {
    const filled = fillMtnTrendDates([
      { date: '2026-06-03', mtnScore: 6, completedTasks: 1 },
      { date: '2026-06-01', mtnScore: 2, completedTasks: 1 },
    ]);

    expect(filled.map(row => row.date)).toEqual(['2026-06-01', '2026-06-02', '2026-06-03']);
    expect(filled[1]).toMatchObject({ mtnScore: 0, completedTasks: 0 });
    expect(filled[2].rollingAverage).toBeCloseTo(8 / 3);
  });

  it('builds unique date ticks and bounded SVG paths', () => {
    const points = [
      { date: '2026-06-01', mtnScore: 0 },
      { date: '2026-06-02', mtnScore: 5 },
      { date: '2026-06-03', mtnScore: 10 },
    ];

    expect(buildMtnDateTicks(points).map(tick => tick.index)).toEqual([0, 1, 2]);
    expect(buildMtnTrendPath(points, 'mtnScore', 10)).toBe('M 34.0 194.0 L 360.0 114.0 L 686.0 34.0');
    expect(buildMtnTrendPath([], 'mtnScore', 10)).toBe('');
  });

  it('maps dates and scores to heatmap positions and classes', () => {
    expect(weekdayIndexFromDate('2026-06-15')).toBe(0);
    expect(weekdayIndexFromDate('2026-06-21')).toBe(6);
    expect(colorForMtnScore(0, 0)).toBe('bg-slate-100');
    expect(colorForMtnScore(4, 1)).toBe('bg-rose-600');
    expect(colorForMtnScore(7, 1)).toBe('bg-rose-300');
    expect(colorForMtnScore(12, 1)).toBe('bg-amber-300');
    expect(colorForMtnScore(17, 1)).toBe('bg-emerald-500');
    expect(colorForMtnScore(20, 1)).toBe('bg-emerald-700');
  });
});
