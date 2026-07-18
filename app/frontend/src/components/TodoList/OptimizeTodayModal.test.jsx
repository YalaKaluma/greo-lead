import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import OptimizeTodayModal from './OptimizeTodayModal';

const buildTasks = (count = 12) => Array.from({ length: count }, (_, index) => ({
  id: index + 1,
  title: `Task ${index + 1}`,
  status: 'open',
  scheduled_date: '2026-07-20',
  due_date: null,
  move_the_needle_score: (index + 1) / 100,
}));

describe('OptimizeTodayModal', () => {
  it('starts with the lowest-MTN task and supports keeping it today', () => {
    render(
      <OptimizeTodayModal
        tasks={buildTasks()}
        todayKey="2026-07-20"
        capacity={25}
        getTaskScore={() => null}
        loading={false}
        onCancel={() => {}}
        onApply={() => {}}
      />
    );

    expect(screen.getByText('Task 1')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Keep today' }));
    expect(screen.getByText('Task 2')).toBeInTheDocument();
  });

  it('reviews changes before applying an accepted movement', () => {
    const onApply = vi.fn();
    render(
      <OptimizeTodayModal
        tasks={buildTasks(11)}
        todayKey="2026-07-20"
        capacity={25}
        getTaskScore={() => null}
        loading={false}
        onCancel={() => {}}
        onApply={onApply}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Later this week' }));
    expect(screen.getByText('Review proposed changes')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Apply selected changes' }));
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply.mock.calls[0][0]).toHaveLength(1);
  });
});
