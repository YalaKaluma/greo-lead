import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
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
});
