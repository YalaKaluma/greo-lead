import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import GoalsList from './GoalsList';


vi.mock('react-beautiful-dnd', () => ({
  DragDropContext: ({ children }) => children,
  Droppable: ({ children }) => children({
    droppableProps: {},
    innerRef: vi.fn(),
    placeholder: null,
  }, { isDraggingOver: false }),
  Draggable: ({ children }) => children({
    draggableProps: { style: {} },
    dragHandleProps: {},
    innerRef: vi.fn(),
  }, { isDragging: false }),
}));


describe('GoalsList outcome interaction', () => {
  it('opens the outcome editor from anywhere on the outcome card without an inline status dropdown', () => {
    const onOutcomeClick = vi.fn();
    const outcome = { id: 3, title: 'Launch the pilot', time_horizon: 'outcome', parent_goal_id: 2 };

    render(
      <GoalsList
        goals={{
          vision: [{ id: 1, title: 'Grow responsibly', time_horizon: 'vision' }],
          pillar: [{ id: 2, title: 'Customer growth', time_horizon: 'pillar', parent_goal_id: 1 }],
          outcome: [outcome],
        }}
        expandedGoalId={1}
        onCardClick={vi.fn()}
        onOutcomeClick={onOutcomeClick}
        onReorderGoals={vi.fn()}
        outcomeStatusByGoalId={{ 3: 'ongoing' }}
      />,
    );

    fireEvent.click(screen.getByText('Launch the pilot'));

    expect(onOutcomeClick).toHaveBeenCalledWith(outcome);
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });
});
