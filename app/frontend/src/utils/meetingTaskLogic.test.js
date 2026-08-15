import { describe, expect, it } from 'vitest';
import { sortMeetingTasks } from './meetingTaskLogic';

describe('sortMeetingTasks', () => {
  const tasks = [
    { id: 1, meeting_id: 10, meeting_started_at: '2026-08-10T09:00:00Z', mtn_score: 0.9, created_at: '2026-08-10T10:00:00Z' },
    { id: 2, meeting_id: 11, meeting_started_at: '2026-08-12T09:00:00Z', mtn_score: 0.2, created_at: '2026-08-12T10:00:00Z' },
    { id: 3, meeting_id: 11, meeting_started_at: '2026-08-12T09:00:00Z', mtn_score: 0.8, created_at: '2026-08-12T11:00:00Z' },
    { id: 4, meeting_id: 10, meeting_started_at: '2026-08-10T09:00:00Z', mtn_score: null, created_at: '2026-08-10T11:00:00Z' },
  ];

  it('groups newest meetings first and sorts each meeting by highest MTN', () => {
    expect(sortMeetingTasks(tasks).map(task => task.id)).toEqual([3, 2, 1, 4]);
  });

  it('keeps meeting order while allowing lowest MTN first within each meeting', () => {
    expect(sortMeetingTasks(tasks, 'asc').map(task => task.id)).toEqual([2, 3, 4, 1]);
  });

  it('does not mutate the API response', () => {
    const originalIds = tasks.map(task => task.id);
    sortMeetingTasks(tasks);
    expect(tasks.map(task => task.id)).toEqual(originalIds);
  });
});
