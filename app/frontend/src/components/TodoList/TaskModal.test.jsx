import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import TaskModal from './TaskModal';


describe('TaskModal mobile focus behavior', () => {
  it('shows the complete dialog before the user chooses a field', () => {
    render(
      <TaskModal
        task={{ id: 7, title: 'Prepare proposal', due_date: '2026-08-15' }}
        onSave={vi.fn()}
        onCancel={vi.fn()}
        onDelete={vi.fn()}
        delegates={[]}
        goals={[]}
        timezone="America/Toronto"
      />,
    );

    expect(screen.getByPlaceholderText('What needs to be done?')).not.toHaveFocus();
    expect(screen.getByText('Edit Task')).toBeVisible();
  });
});
