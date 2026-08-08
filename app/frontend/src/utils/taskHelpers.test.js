import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  dateStringToLocalDate,
  formatDueDate,
  getLongTermGoals,
  getMtnLabel,
  getSortedGoals,
  getTodayET,
  isOverdueET,
  isTodayET,
  normalizeTimezone,
} from './taskHelpers';

describe('taskHelpers date handling', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15T16:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('falls back to the default timezone when a saved timezone is invalid', () => {
    expect(normalizeTimezone('Not/AZone')).toBe('America/New_York');
  });

  it('returns today in the requested timezone', () => {
    expect(getTodayET('America/New_York')).toBe('2026-06-15');
    expect(getTodayET('Pacific/Kiritimati')).toBe('2026-06-16');
  });

  it('compares due dates by calendar day in the active timezone', () => {
    expect(isOverdueET('2026-06-14T23:59:00Z', 'America/New_York')).toBe(true);
    expect(isTodayET('2026-06-15T00:01:00Z', 'America/New_York')).toBe(true);
    expect(isOverdueET('2026-06-16', 'America/New_York')).toBe(false);
  });

  it('formats due dates relative to today without timezone drift', () => {
    expect(formatDueDate('2026-06-14', 'America/New_York')).toBe('Overdue 1d');
    expect(formatDueDate('2026-06-15', 'America/New_York')).toBe('Today');
    expect(formatDueDate('2026-06-16', 'America/New_York')).toBe('Tomorrow');
    expect(formatDueDate('2026-06-20', 'America/New_York')).toBe('In 5d');
    expect(formatDueDate('2026-06-30', 'America/New_York')).toBe('Jun 30');
  });

  it('parses date-only strings as local calendar dates', () => {
    const date = dateStringToLocalDate('2026-06-15T23:30:00Z');

    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(5);
    expect(date.getDate()).toBe(15);
  });
});

describe('taskHelpers goal hierarchy', () => {
  const goals = [
    { id: 30, title: 'Outcome B', time_horizon: 'outcome', parent_goal_id: 20 },
    { id: 10, title: 'Vision A', time_horizon: 'vision' },
    { id: 40, title: 'Loose outcome', time_horizon: 'short_term' },
    { id: 20, title: 'Pillar A', time_horizon: 'pillar', parent_goal_id: 10 },
    { id: 50, title: 'Vision B', time_horizon: 'long_term' },
  ];

  it('orders goals as vision, child pillar, child outcome, then unattached goals', () => {
    expect(getSortedGoals(goals).map(goal => goal.id)).toEqual([10, 20, 30, 50, 40]);
  });

  it('returns only long-term goal variants for task linking controls', () => {
    expect(getLongTermGoals(goals).map(goal => goal.id)).toEqual([10, 50]);
  });
});

describe('taskHelpers MTN labels', () => {
  it('maps scores to stable move-the-needle labels', () => {
    expect(getMtnLabel(0.9)).toBe('1. Transformation');
    expect(getMtnLabel(0.7)).toBe('2. Strategic');
    expect(getMtnLabel(0.5)).toBe('3. Important');
    expect(getMtnLabel(0.3)).toBe('4. Tactical');
    expect(getMtnLabel(0.1)).toBe('5. Operational');
    expect(getMtnLabel('not-a-score')).toBe('');
  });
});
