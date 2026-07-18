import { describe, expect, it } from 'vitest';
import {
  buildMtnCapacity,
  getCalendarTasks,
  getTaskScheduledDate,
  replaceTaskDueDate,
  summarizeCalendarDay,
} from './todoCalendarLogic.js';

const task = (overrides = {}) => ({
  id: overrides.id ?? 1,
  title: overrides.title ?? 'Task',
  status: 'open',
  due_date: '2026-06-19',
  ...overrides,
});

describe('todoCalendarLogic', () => {
  it('groups only open tasks due in the next seven days by default focus filter', () => {
    const tasks = [
      task({ id: 1, title: 'Transformational today', due_date: '2026-06-19', move_the_needle_score: 0.9 }),
      task({ id: 2, title: 'Strategic tomorrow', due_date: '2026-06-20', move_the_needle_score: 0.72 }),
      task({ id: 3, title: 'Outside window', due_date: '2026-06-26', move_the_needle_score: 0.95 }),
      task({ id: 4, title: 'Completed', status: 'completed', due_date: '2026-06-20', move_the_needle_score: 0.95 }),
      task({ id: 5, title: 'Maintenance', due_date: '2026-06-21', move_the_needle_score: 0.4 }),
    ];

    const result = getCalendarTasks({
      tasks,
      todayKey: '2026-06-19',
      selectedMtnTags: ['1. Transformation', '2. Strategic'],
    });

    expect(result.days).toHaveLength(7);
    expect(result.groupedTasks['2026-06-19'].map(item => item.title)).toEqual(['Transformational today']);
    expect(result.groupedTasks['2026-06-20'].map(item => item.title)).toEqual(['Strategic tomorrow']);
    expect(Object.values(result.groupedTasks).flat().map(item => item.title)).not.toContain('Outside window');
    expect(Object.values(result.groupedTasks).flat().map(item => item.title)).not.toContain('Completed');
    expect(Object.values(result.groupedTasks).flat().map(item => item.title)).not.toContain('Maintenance');
  });

  it('supports operational, unclassified, and overdue task filters', () => {
    const tasks = [
      task({ id: 1, title: 'Overdue strategic', due_date: '2026-06-18', move_the_needle_score: 0.8 }),
      task({ id: 2, title: 'Important work', due_date: '2026-06-19', move_the_needle_score: 0.6 }),
      task({ id: 3, title: 'No score', due_date: '2026-06-20' }),
    ];

    const operational = getCalendarTasks({ tasks, todayKey: '2026-06-19', selectedMtnTags: ['3. Important'] });
    expect(operational.groupedTasks['2026-06-19'].map(item => item.title)).toEqual(['Important work']);

    const searchFiltered = getCalendarTasks({ tasks, todayKey: '2026-06-19', searchQuery: 'No score' });
    expect(searchFiltered.groupedTasks['2026-06-20'].map(item => item.title)).toEqual(['No score']);

    const focus = getCalendarTasks({
      tasks,
      todayKey: '2026-06-19',
      selectedMtnTags: ['1. Transformation', '2. Strategic'],
    });
    expect(focus.overdueTasks.map(item => item.title)).toEqual(['Overdue strategic']);
  });

  it('preserves existing due time when replacing the calendar day', () => {
    expect(replaceTaskDueDate('2026-06-19T15:30:00Z', '2026-06-22')).toBe('2026-06-22T15:30:00Z');
    expect(replaceTaskDueDate('2026-06-19', '2026-06-22')).toBe('2026-06-22');
  });

  it('prefers scheduled date while retaining legacy due-date fallback', () => {
    expect(getTaskScheduledDate(task({ scheduled_date: '2026-06-22', due_date: '2026-06-25' }))).toBe('2026-06-22');
    expect(getTaskScheduledDate(task({ due_date: '2026-06-25T12:00:00' }))).toBe('2026-06-25');
  });

  it('adds daily task MTN scores on the 0-10 scale', () => {
    const summary = summarizeCalendarDay([
      task({ id: 1, move_the_needle_score: 0.9 }),
      task({ id: 2, move_the_needle_score: 0.6 }),
      task({ id: 3, move_the_needle_score: null }),
    ], 12);

    expect(summary).toMatchObject({
      taskCount: 3,
      expectedMtn: 15,
      averageMtn: 7.5,
      missingScoreCount: 1,
      status: 'heavy',
    });
  });

  it('uses 25 as the minimum daily MTN capacity', () => {
    const trend = Array.from({ length: 23 }, (_, index) => ({
      date: `2026-06-${String(index + 1).padStart(2, '0')}`,
      mtn_score: index === 0 ? 100 : 10,
    }));
    expect(buildMtnCapacity(trend, '2026-06-23')).toBe(25);
    expect(buildMtnCapacity([], '2026-06-23')).toBe(25);
  });

  it('allows sustained historical MTN capacity to exceed the minimum', () => {
    const trend = Array.from({ length: 21 }, (_, index) => ({
      date: `2026-06-${String(index + 1).padStart(2, '0')}`,
      mtn_score: 32,
    }));
    expect(buildMtnCapacity(trend, '2026-06-22')).toBe(32);
  });
});
