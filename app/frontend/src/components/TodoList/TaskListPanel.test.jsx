import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import TaskListPanel from './TaskListPanel';

const baseProps = {
  activeTab: 'tasks',
  sortedTasks: [],
  hasActiveFilters: false,
  emptyText: 'No tasks',
  emptyFilteredText: 'No filtered tasks',
  emptyNewText: 'Create a new task',
  selectionMode: false,
  columnSort: null,
  onSort: () => {},
  onDragEnd: () => {},
  completingTasks: [],
  selectedTasks: [],
  onToggleTask: () => {},
  onStartEdit: () => {},
  onLongPress: () => {},
  onSelectToggle: () => {},
  onFollowUp: () => {},
  goals: [],
  priorityMode: false,
  getVisibleTaskScore: () => null,
  onMtnFeedback: () => {},
  timezone: 'America/New_York',
};

describe('TaskListPanel', () => {
  it('renders nothing outside the tasks tab', () => {
    const { container } = render(<TaskListPanel {...baseProps} activeTab="trends" />);

    expect(container).toBeEmptyDOMElement();
  });

  it('renders the new-task empty state without filters', () => {
    render(<TaskListPanel {...baseProps} />);

    expect(screen.getByText('No tasks')).toBeInTheDocument();
    expect(screen.getByText('Create a new task')).toBeInTheDocument();
  });

  it('renders the filtered empty state when filters are active', () => {
    render(<TaskListPanel {...baseProps} hasActiveFilters />);

    expect(screen.getByText('No filtered tasks')).toBeInTheDocument();
  });

  it('opens Do later from the task-card arrow action', () => {
    const onDoLater = vi.fn();
    const task = {
      id: 1,
      title: 'Move this task later',
      status: 'open',
      priority: 'Medium',
      due_date: '2026-07-20',
    };
    render(
      <TaskListPanel
        {...baseProps}
        sortedTasks={[task]}
        onDoLater={onDoLater}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Do later' }));
    expect(onDoLater).toHaveBeenCalledWith(task);
  });

  it('submits MTN tag feedback with the task id in the expected argument position', async () => {
    const onMtnFeedback = vi.fn(async () => ({ success: true }));
    const task = {
      id: 167,
      title: 'Retag this task',
      status: 'open',
      priority: 'Medium',
      due_date: '2026-07-20',
    };

    render(
      <TaskListPanel
        {...baseProps}
        sortedTasks={[task]}
        priorityMode
        getVisibleTaskScore={() => ({
          score: 0.6,
          score_id: 44,
          recommendation_id: 55,
          reason: 'Important work',
        })}
        onMtnFeedback={onMtnFeedback}
      />
    );

    fireEvent.click(screen.getAllByRole('button', { name: '3. Important' })[0]);
    fireEvent.click(screen.getByRole('button', { name: '2. Strategic' }));
    fireEvent.click(screen.getByRole('button', { name: '4 stars' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save Feedback' }));

    await waitFor(() => expect(onMtnFeedback).toHaveBeenCalled());
    expect(onMtnFeedback.mock.calls[0]).toEqual([
      167,
      4,
      null,
      '2. Strategic',
      55,
      44,
      0.775,
    ]);
  });
});
