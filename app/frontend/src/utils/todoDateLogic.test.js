import { describe, expect, it } from 'vitest';
import {
  addDays,
  dateFromKey,
  dateKey,
  dateToTime,
  formatCalendarRangeLabel,
  formatDateKey,
  formatMonthShort,
  formatShortDate,
  getRollingCalendarDays,
} from './todoDateLogic';

describe('todoDateLogic', () => {
  it('extracts and converts stable calendar date keys', () => {
    expect(dateKey('Completed on 2026-06-15T12:00:00Z')).toBe('2026-06-15');
    expect(dateKey('not a date')).toBe('');
    expect(dateToTime('2026-06-15')).toBe(new Date(2026, 5, 15).getTime());
    expect(dateToTime('missing')).toBeNull();
  });

  it('formats calendar keys and labels without timezone drift', () => {
    const date = dateFromKey('2026-06-15');

    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(5);
    expect(date.getDate()).toBe(15);
    expect(formatDateKey(addDays(date, 2))).toBe('2026-06-17');
    expect(formatShortDate('2026-06-15T23:00:00Z')).toBe('Jun 15');
    expect(formatMonthShort(date)).toBe('June 2026');
  });

  it('builds follow-up calendar grids with leading blanks and full weeks', () => {
    const days = getRollingCalendarDays(new Date(2026, 5, 15), 30);

    expect(days).toHaveLength(35);
    expect(days[0]).toBeNull();
    expect(formatDateKey(days[1])).toBe('2026-06-15');
    expect(days[34]).toBeNull();
  });

  it('formats follow-up calendar ranges across years when needed', () => {
    expect(formatCalendarRangeLabel(new Date(2026, 5, 15), new Date(2026, 6, 14))).toBe('Jun 15 - Jul 14, 2026');
    expect(formatCalendarRangeLabel(new Date(2026, 11, 20), new Date(2027, 0, 18))).toBe('Dec 20, 2026 - Jan 18, 2027');
  });
});
