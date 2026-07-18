import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import BulkActionModal from './BulkActionModal';

describe('BulkActionModal', () => {
  it('includes scheduled date in selected bulk updates', () => {
    const onApply = vi.fn();
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

    expect(onApply).toHaveBeenCalledWith({ scheduled_date: '2026-07-22' });
  });
});
