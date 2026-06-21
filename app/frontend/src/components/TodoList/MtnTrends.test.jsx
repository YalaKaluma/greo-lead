import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DailyMtnNeedle, MtnBreakdownModal, TaskMtnTrendsTab } from './MtnTrends';
import { buildDailyMtnBenchmark } from '../../utils/todoMtnTrends.js';

describe('DailyMtnNeedle', () => {
  it('renders static benchmark copy while history is forming', () => {
    render(
      <DailyMtnNeedle
        score={6}
        completedTasks={2}
        benchmark={{ isDynamic: false, effectiveMax: 20 }}
        onClick={() => {}}
      />
    );

    expect(screen.getByRole('button', { name: /6\.0 MTN from 2 done/i })).toHaveAttribute(
      'title',
      expect.stringContaining('Static scale until 7 active MTN days')
    );
  });

  it('calls onClick when opening the MTN breakdown', () => {
    const onClick = vi.fn();

    render(
      <DailyMtnNeedle
        score={12}
        completedTasks={3}
        benchmark={{ isDynamic: true, effectiveMax: 20, avgMtn: 10 }}
        onClick={onClick}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /today's MTN: 12\.0/i }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe('MtnBreakdownModal', () => {
  it('renders an empty state when no completed tasks contributed', () => {
    render(
      <MtnBreakdownModal
        score={0}
        tasks={[]}
        date="2026-06-15"
        timezone="America/New_York"
        onClose={() => {}}
      />
    );

    expect(screen.getByText("Today's MTN breakdown")).toBeInTheDocument();
    expect(screen.getByText("No completed tasks have contributed to today's MTN score yet.")).toBeInTheDocument();
  });

  it('renders contributing tasks and closes from the icon button', () => {
    const onClose = vi.fn();

    render(
      <MtnBreakdownModal
        score={8.5}
        tasks={[{
          id: 1,
          title: 'Finish launch brief',
          completed_at: '2026-06-15T16:30:00Z',
          mtn_score: 8.5,
        }]}
        date="2026-06-15"
        timezone="America/New_York"
        onClose={onClose}
      />
    );

    expect(screen.getByText('8.5 MTN on 2026-06-15 from 1 completed task(s)')).toBeInTheDocument();
    expect(screen.getByText('Finish launch brief')).toBeInTheDocument();
    expect(screen.getByText('8.5')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Close MTN breakdown' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('TaskMtnTrendsTab', () => {
  it('renders loading and error states', () => {
    const { rerender } = render(<TaskMtnTrendsTab trends={null} loading error={null} />);

    expect(screen.getByText('Loading MTN trends...')).toBeInTheDocument();

    rerender(<TaskMtnTrendsTab trends={null} loading={false} error="Unable to load MTN trends right now." />);

    expect(screen.getByText('Unable to load MTN trends right now.')).toBeInTheDocument();
  });

  it('renders summary tiles and procrastination ranking from trend data', () => {
    const trends = {
      summary: {
        today: { date: '2026-06-15', mtn_score: 8.5, completed_tasks: 2 },
        last_7_days: {
          total_score: 34,
          average_score: 4.9,
          trend: { label: 'Rising', delta_vs_30: 1.2 },
        },
        last_30_days: { total_score: 120, average_score: 4, active_days: 18 },
        last_90_days: { total_score: 300, completed_tasks: 80 },
        procrastination_ranking: [{
          id: 10,
          title: 'Deferred task',
          project: 'Ops',
          due_date: '2026-06-18',
          mtn_score: 0.4,
          status: 'open',
          times_postponed: 3,
        }],
      },
      trend_chart: [
        { date: '2026-06-14', mtn_score: 4, rolling_average: 3, completed_tasks: 1 },
        { date: '2026-06-15', mtn_score: 8.5, rolling_average: 4, completed_tasks: 2 },
      ],
    };

    render(<TaskMtnTrendsTab trends={trends} loading={false} error={null} />);

    expect(screen.getByText('Today')).toBeInTheDocument();
    expect(screen.getByText('8.5')).toBeInTheDocument();
    expect(screen.getByText('4.9')).toBeInTheDocument();
    expect(screen.getByText('34.0 total MTN')).toBeInTheDocument();
    expect(screen.getByText('120.0 total MTN, 18 active day(s)')).toBeInTheDocument();
    expect(screen.getByText('Rising')).toBeInTheDocument();
    expect(screen.getByText('+1.2 vs 30-day avg')).toBeInTheDocument();
    expect(screen.getByText('90-Day Total')).toBeInTheDocument();
    expect(screen.getByText('Deferred task')).toBeInTheDocument();
    expect(screen.getByText('3x')).toBeInTheDocument();
  });

  it('can render with a dynamic benchmark payload shape used by the page header', () => {
    const benchmark = buildDailyMtnBenchmark({
      summary: { today: { date: '2026-06-09' } },
      trendChart: Array.from({ length: 8 }, (_, index) => ({
        date: `2026-06-${String(index + 1).padStart(2, '0')}`,
        mtnScore: index + 1,
        completedTasks: 1,
      })),
    });

    render(
      <DailyMtnNeedle
        score={9}
        completedTasks={2}
        benchmark={benchmark}
        onClick={() => {}}
      />
    );

    expect(screen.getByRole('button', { name: /today's MTN: 9\.0/i })).toHaveAttribute(
      'title',
      expect.stringContaining('above your 30-day average')
    );
  });
});
