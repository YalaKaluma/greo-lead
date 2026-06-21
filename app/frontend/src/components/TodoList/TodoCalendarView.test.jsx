import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import TodoCalendarView from './TodoCalendarView';

const task = (overrides = {}) => ({
  id: overrides.id ?? 1,
  title: overrides.title ?? 'Task',
  status: 'open',
  due_date: '2026-06-19',
  ...overrides,
});

function dataTransfer() {
  const store = {};
  return {
    effectAllowed: '',
    dropEffect: '',
    setData: vi.fn((type, value) => {
      store[type] = value;
    }),
    getData: vi.fn(type => store[type]),
  };
}

describe('TodoCalendarView', () => {
  const baseProps = {
    activeTab: 'calendar',
    todayKey: '2026-06-19',
    selectedMtnTags: ['Transformational', 'Strategic'],
    searchQuery: '',
    goals: [{ id: 10, title: 'Launch goal' }],
    getTaskScore: () => null,
    onStartEdit: () => {},
    onReschedule: () => {},
  };

  it('renders seven day columns and defaults to Transformational and Strategic tasks', () => {
    render(
      <TodoCalendarView
        {...baseProps}
        tasks={[
          task({ id: 1, title: 'Transformational today', due_date: '2026-06-19', move_the_needle_score: 0.9 }),
          task({ id: 2, title: 'Strategic tomorrow', due_date: '2026-06-20', move_the_needle_score: 0.75 }),
          task({ id: 3, title: 'Operational hidden', due_date: '2026-06-21', move_the_needle_score: 0.45 }),
        ]}
      />
    );

    expect(screen.getAllByRole('region')).toHaveLength(7);
    expect(screen.getByRole('region', { name: 'Today Jun 19' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Thu Jun 25' })).toBeInTheDocument();
    expect(screen.getByText('Transformational today')).toBeInTheDocument();
    expect(screen.getByText('Strategic tomorrow')).toBeInTheDocument();
    expect(screen.queryByText('Operational hidden')).not.toBeInTheDocument();
  });

  it('uses shared MTN tags and opens a task through the existing edit behavior', () => {
    const onStartEdit = vi.fn();
    const operationalTask = task({
      id: 3,
      title: 'Operational visible',
      due_date: '2026-06-21',
      move_the_needle_score: 0.55,
      goal_id: 10,
      estimated_effort: '30m',
      delegated_to: 'Avery',
      is_recurring: true,
    });

    const { rerender } = render(
      <TodoCalendarView
        {...baseProps}
        selectedMtnTags={['Important']}
        tasks={[operationalTask]}
        onStartEdit={onStartEdit}
      />
    );

    expect(screen.getByText('Operational visible')).toBeInTheDocument();
    expect(screen.getByText('Launch goal')).toBeInTheDocument();
    expect(screen.getByText('30m')).toBeInTheDocument();
    expect(screen.getByText('Avery')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Operational visible/ }));
    expect(onStartEdit).toHaveBeenCalledWith(operationalTask);

    rerender(
      <TodoCalendarView
        {...baseProps}
        selectedMtnTags={['Strategic']}
        tasks={[operationalTask]}
        onStartEdit={onStartEdit}
      />
    );
    expect(screen.queryByText('Operational visible')).not.toBeInTheDocument();
  });

  it('drops a task onto another day and calls reschedule with the new date', () => {
    const onReschedule = vi.fn();
    const taskToMove = task({ id: 1, title: 'Move me', due_date: '2026-06-19', move_the_needle_score: 0.9 });
    const transfer = dataTransfer();

    render(
      <TodoCalendarView
        {...baseProps}
        tasks={[taskToMove]}
        onReschedule={onReschedule}
      />
    );

    fireEvent.dragStart(screen.getByRole('button', { name: /Move me/ }), { dataTransfer: transfer });
    const tomorrow = screen.getByRole('region', { name: 'Tomorrow Jun 20' });
    fireEvent.dragOver(tomorrow, { dataTransfer: transfer });
    fireEvent.drop(tomorrow, { dataTransfer: transfer });

    expect(onReschedule).toHaveBeenCalledWith(taskToMove, '2026-06-20');
  });

  it('renders overdue tasks above the calendar', () => {
    render(
      <TodoCalendarView
        {...baseProps}
        tasks={[task({ id: 1, title: 'Late strategic', due_date: '2026-06-18', move_the_needle_score: 0.8 })]}
      />
    );

    expect(screen.getByText('Overdue')).toBeInTheDocument();
    expect(screen.getByText('Late strategic')).toBeInTheDocument();
  });
});
