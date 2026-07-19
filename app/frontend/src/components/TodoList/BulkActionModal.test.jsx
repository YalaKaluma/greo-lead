import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import BulkActionModal from './BulkActionModal';

describe('BulkActionModal', () => {
  it('includes due date in selected bulk updates', async () => {
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

    fireEvent.click(screen.getByRole('button', { name: 'Choose due date' }));
    fireEvent.change(screen.getByLabelText('Due Date'), { target: { value: '2026-07-22' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply to 2 Tasks' }));

    await waitFor(() => expect(onApply).toHaveBeenCalledWith(
      { due_date: '2026-07-22' }
    ));
  });

  it('updates the one date directly without a conflict step', async () => {
    const onApply = vi.fn().mockResolvedValue({ applied: true });
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

    fireEvent.click(screen.getByRole('button', { name: 'Choose due date' }));
    fireEvent.change(screen.getByLabelText('Due Date'), { target: { value: '2026-07-22' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply to 2 Tasks' }));

    await waitFor(() => expect(onApply).toHaveBeenCalledWith(
      { due_date: '2026-07-22' }
    ));
  });
});
