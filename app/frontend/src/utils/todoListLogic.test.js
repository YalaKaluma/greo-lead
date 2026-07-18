import { describe, expect, it, vi } from 'vitest';
import {
  compareTasksByColumn,
  getSortedTasks,
  getStoredTaskScore,
  getVisibleTaskScore,
  getVisibleTasks,
  mtnSortValue,
  prioritySortValue,
  taskMatchesSearch,
  taskMatchesSelectedMtnTags,
} from './todoListLogic';

const task = (overrides) => ({
  id: 1,
  title: 'Review launch plan',
  priority: 'medium',
  status: 'open',
  ...overrides,
});

describe('todoListLogic score resolution', () => {
  it('normalizes stored MTN scores and preserves recommendation metadata', () => {
    expect(getStoredTaskScore(task({
      id: 7,
      title: 'Lead team sync',
      mtn_score_today: 8.5,
      mtn_reason_today: 'Highest leverage',
      mtn_risk_today: 'Launch slips',
      mtn_rank_today: 2,
      mtn_recommended_today: true,
      mtn_recommendation_id: 'rec-7',
    }))).toEqual({
      task_id: 7,
      title: 'Lead team sync',
      score: 0.85,
      reason: 'Highest leverage',
      risk_if_ignored: 'Launch slips',
      confidence: 'medium',
      rank: 2,
      is_top_mtn: true,
      recommendation_id: 'rec-7',
    });
  });

  it('falls back from hook scores to stored scores and ignores invalid stored scores', () => {
    const hookScore = { task_id: 2, score: 0.9, rank: 1 };

    expect(getVisibleTaskScore(task({ id: 2, mtn_score_today: 0.3 }), () => hookScore)).toBe(hookScore);
    expect(getVisibleTaskScore(task({ mtn_score_today: 'nope' }))).toBeNull();
  });
});

describe('todoListLogic filtering', () => {
  it('matches search text across task fields used by the todo page', () => {
    const sourceTask = task({
      title: 'Ordinary title',
      description: 'Prepare the board memo',
      project: 'Q3 planning',
      delegated_to: 'Ari',
      goal_title: 'Scale leadership',
      strategic_intent: 'Protect focus',
      mtn_reason_today: 'Unblocks hiring',
      mtn_risk_today: 'Decision drift',
    });

    expect(taskMatchesSearch(sourceTask, 'board memo')).toBe(true);
    expect(taskMatchesSearch(sourceTask, 'SCALE LEADERSHIP')).toBe(true);
    expect(taskMatchesSearch(sourceTask, 'decision drift')).toBe(true);
    expect(taskMatchesSearch(sourceTask, 'missing phrase')).toBe(false);
  });

  it('filters by selected MTN tags using visible score data', () => {
    const strategicTask = task({ id: 2, mtn_score_today: 0.72 });
    const lowLeverageTask = task({ id: 3, mtn_score_today: 0.1 });

    expect(taskMatchesSelectedMtnTags(strategicTask, ['2. Strategic'])).toBe(true);
    expect(taskMatchesSelectedMtnTags(lowLeverageTask, ['2. Strategic'])).toBe(false);
    expect(taskMatchesSelectedMtnTags(task({ id: 4 }), ['2. Strategic'])).toBe(false);
  });

  it('combines search and MTN tag filters without mutating tasks', () => {
    const tasks = [
      task({ id: 1, title: 'Strategic hiring', mtn_score_today: 0.75 }),
      task({ id: 2, title: 'Strategic admin', mtn_score_today: 0.2 }),
      task({ id: 3, title: 'Financial review', mtn_score_today: 0.8 }),
    ];

    expect(getVisibleTasks({
      tasks,
      selectedMtnTags: ['2. Strategic'],
      searchQuery: 'strategic',
    }).map(item => item.id)).toEqual([1]);
    expect(tasks.map(item => item.id)).toEqual([1, 2, 3]);
  });
});

describe('todoListLogic sorting', () => {
  it('sorts Top 10 tasks first by position, then remaining tasks by priority and due date', () => {
    const tasks = [
      task({ id: 1, title: 'Low soon', priority: 'low', due_date: '2026-06-16' }),
      task({ id: 2, title: 'Top second', in_top10: true, top10_position: 2, priority: 'low' }),
      task({ id: 3, title: 'Top first', in_top10: true, top10_position: 1, priority: 'low' }),
      task({ id: 4, title: 'High later', priority: 'high', due_date: '2026-06-20' }),
      task({ id: 5, title: 'High soon', priority: 'high', due_date: '2026-06-15' }),
    ];

    expect(getSortedTasks({ tasks }).map(item => item.id)).toEqual([3, 2, 5, 4, 1]);
  });

  it('lets manual drag-and-drop order win over MTN scoring', () => {
    const tasks = [
      task({ id: 1, mtn_score_today: 0.9 }),
      task({ id: 2, mtn_score_today: 0.1 }),
      task({ id: 3, mtn_score_today: 0.8 }),
    ];

    expect(getSortedTasks({ tasks, sortOrder: [2, 1] }).map(item => item.id)).toEqual([2, 1, 3]);
  });

  it('keeps manual drag-and-drop order while priority mode is active', () => {
    const tasks = [
      task({ id: 1, mtn_score_today: 0.9, mtn_rank_today: 1 }),
      task({ id: 2, mtn_score_today: 0.1, mtn_rank_today: 2 }),
      task({ id: 3, mtn_score_today: 0.8, mtn_rank_today: 3 }),
    ];

    expect(getSortedTasks({
      tasks,
      sortOrder: [3, 2, 1],
      priorityMode: true,
    }).map(item => item.id)).toEqual([3, 2, 1]);
  });

  it('uses persisted backend sort order before stored MTN scoring', () => {
    const tasks = [
      task({ id: 1, sort_order: 20, mtn_score_today: 0.9 }),
      task({ id: 2, sort_order: 10, mtn_score_today: 0.1 }),
      task({ id: 3, sort_order: null, mtn_score_today: 0.8 }),
    ];

    expect(getSortedTasks({ tasks }).map(item => item.id)).toEqual([2, 1, 3]);
  });

  it('uses persisted backend sort order while priority mode is active', () => {
    const tasks = [
      task({ id: 1, sort_order: 2, mtn_score_today: 0.9, mtn_rank_today: 1 }),
      task({ id: 2, sort_order: 0, mtn_score_today: 0.1, mtn_rank_today: 2 }),
      task({ id: 3, sort_order: 1, mtn_score_today: 0.8, mtn_rank_today: 3 }),
    ];

    expect(getSortedTasks({ tasks, priorityMode: true }).map(item => item.id)).toEqual([2, 3, 1]);
  });

  it('sorts by MTN rank before score when no manual or persisted order exists', () => {
    const tasks = [
      task({ id: 1, mtn_score_today: 0.9, mtn_rank_today: 3 }),
      task({ id: 2, mtn_score_today: 0.7, mtn_rank_today: 1 }),
      task({ id: 3, mtn_score_today: 0.95, mtn_rank_today: 2 }),
      task({ id: 4 }),
    ];

    expect(getSortedTasks({ tasks }).map(item => item.id)).toEqual([2, 3, 1, 4]);
  });

  it('supports explicit column sorting for urgency and importance', () => {
    const tasks = [
      task({ id: 1, title: 'B low', priority: 'low', mtn_score_today: 0.1 }),
      task({ id: 2, title: 'A high', priority: 'high', mtn_score_today: 0.75 }),
      task({ id: 3, title: 'C medium', priority: 'medium', mtn_score_today: 0.95 }),
    ];

    expect(getSortedTasks({ tasks, columnSort: { key: 'urgency', direction: 'desc' } }).map(item => item.id)).toEqual([2, 3, 1]);
    expect(getSortedTasks({ tasks, columnSort: { key: 'importance', direction: 'desc' } }).map(item => item.id)).toEqual([3, 2, 1]);
  });

  it('keeps comparator tie-breaking stable by title and id', () => {
    const alphaOne = task({ id: 1, title: 'Alpha', priority: 'high' });
    const alphaTwo = task({ id: 2, title: 'Alpha', priority: 'high' });
    const beta = task({ id: 3, title: 'Beta', priority: 'high' });

    expect(compareTasksByColumn(beta, alphaOne, { key: 'urgency', direction: 'desc' })).toBeGreaterThan(0);
    expect(compareTasksByColumn(alphaTwo, alphaOne, { key: 'urgency', direction: 'desc' })).toBeGreaterThan(0);
  });

  it('exposes priority and MTN sort values for focused regression coverage', () => {
    const hookScores = new Map([[10, { task_id: 10, score: 0.86 }]]);
    const getTaskScore = vi.fn(id => hookScores.get(id));

    expect(prioritySortValue('HIGH')).toBe(0);
    expect(prioritySortValue('unknown')).toBe(3);
    expect(mtnSortValue(task({ id: 10 }), getTaskScore)).toBe(0);
    expect(mtnSortValue(task({ id: 11 }))).toBe(999);
  });
});
