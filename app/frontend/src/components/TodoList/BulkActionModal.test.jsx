import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import BulkActionModal from './BulkActionModal';

describe('BulkActionModal', () => {
  it('includes scheduled date in selected bulk updates', async () => {
    const onApply = vi.fn(async () => ({ applied: true }));
    render(
      <BulkActionModal
        selectedCount={2}
        onApply={onApply}
        onCancel={() => {}}
        delegates={[]}
        goals={[]}
        timezone="America/New_York"
      />
    );

    fireEvent.change(screen.getByLabelText('Scheduled Date'), { target: { value: '2026-07-22' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply to 2 Tasks' }));

    await waitFor(() => expect(onApply).toHaveBeenCalledWith(
      { scheduled_date: '2026-07-22' },
      { overrideDueDates: false }
    ));
  });

  it('keeps due-date conflicts inline and allows the user to override them', async () => {
    const onApply = vi
      .fn()
      .mockResolvedValueOnce({ conflicts: 2 })
      .mockResolvedValueOnce({ applied: true });
    render(
      <BulkActionModal
        selectedCount={2}
        onApply={onApply}
        onCancel={() => {}}
        delegates={[]}
        goals={[]}
        timezone="America/New_York"
      />
    );

    fireEvent.change(screen.getByLabelText('Scheduled Date'), { target: { value: '2026-07-22' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply to 2 Tasks' }));

    expect(await screen.findByText(/would be scheduled after their current due date/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Apply to 2 Tasks' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Continue and update due dates' }));

    await waitFor(() => expect(onApply).toHaveBeenLastCalledWith(
      { scheduled_date: '2026-07-22' },
      { overrideDueDates: true }
    ));
  });
});
