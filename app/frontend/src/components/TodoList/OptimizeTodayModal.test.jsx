import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import OptimizeTodayModal from './OptimizeTodayModal';

const buildTasks = (count = 12) => Array.from({ length: count }, (_, index) => ({
  id: index + 1,
  title: `Task ${index + 1}`,
  status: 'open',
  due_date: '2026-07-20',
  move_the_needle_score: (index + 1) / 100,
}));

describe('OptimizeTodayModal', () => {
  it('starts with the highest-MTN task and supports keeping it today', () => {
    render(
      <OptimizeTodayModal
        tasks={buildTasks()}
        todayKey="2026-07-20"
        capacity={25}
        getTaskScore={() => null}
        loading={false}
        onCancel={() => {}}
        onApplyMove={async () => true}
        onMarkDone={async () => true}
      />
    );

    expect(screen.getByText('Task 12')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Keep today' }));
    expect(screen.getByText('1/12 tasks prioritized · 1 approved for today')).toBeInTheDocument();
    expect(screen.getByText('Task 11')).toBeInTheDocument();
  });

  it('reports only tasks in today optimization scope', () => {
    const tasks = [
      ...buildTasks(),
      { id: 13, title: 'Future task', status: 'open', due_date: '2026-07-21' },
      { id: 14, title: 'Completed task', status: 'completed', due_date: '2026-07-20' },
    ];

    render(
      <OptimizeTodayModal
        tasks={tasks}
        todayKey="2026-07-20"
        capacity={25}
        getTaskScore={() => null}
        loading={false}
        onCancel={() => {}}
        onApplyMove={async () => true}
        onMarkDone={async () => true}
      />
    );

    expect(screen.getByText('0/12 tasks prioritized · 0 approved for today')).toBeInTheDocument();
  });

  it('applies an accepted movement immediately', async () => {
    const onApplyMove = vi.fn(async () => true);
    render(
      <OptimizeTodayModal
        tasks={buildTasks(11)}
        todayKey="2026-07-20"
        capacity={25}
        getTaskScore={() => null}
        loading={false}
        onCancel={() => {}}
        onApplyMove={onApplyMove}
        onMarkDone={async () => true}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Later this week' }));
    expect(await screen.findByText('Review proposed changes')).toBeInTheDocument();
    expect(onApplyMove).toHaveBeenCalledTimes(1);
    expect(onApplyMove.mock.calls[0][0]).toMatchObject({ action: 'move', targetDate: '2026-07-21' });
    expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument();
  });

  it('marks a reviewed task as done immediately', async () => {
    const onMarkDone = vi.fn(async () => true);
    render(
      <OptimizeTodayModal
        tasks={buildTasks(11)}
        todayKey="2026-07-20"
        capacity={25}
        getTaskScore={() => null}
        loading={false}
        onCancel={() => {}}
        onApplyMove={async () => true}
        onMarkDone={onMarkDone}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Mark as done' }));
    expect(await screen.findByText('Marked as done')).toBeInTheDocument();
    expect(onMarkDone).toHaveBeenCalledWith(expect.objectContaining({ id: 11 }));
  });

  it('honors an exact due date without applying a capacity limit', async () => {
    const onApplyMove = vi.fn(async () => true);
    render(
      <OptimizeTodayModal
        tasks={buildTasks(11)}
        todayKey="2026-07-20"
        capacity={1}
        getTaskScore={() => null}
        loading={false}
        onCancel={() => {}}
        onApplyMove={onApplyMove}
        onMarkDone={async () => true}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Choose exact date' }));
    fireEvent.change(screen.getByLabelText('Exact due date'), { target: { value: '2026-07-22' } });
    fireEvent.click(screen.getByRole('button', { name: 'Set due date' }));

    expect(await screen.findByText('Review proposed changes')).toBeInTheDocument();
    expect(onApplyMove).toHaveBeenCalledWith(expect.objectContaining({ targetDate: '2026-07-22' }));
  });
});
