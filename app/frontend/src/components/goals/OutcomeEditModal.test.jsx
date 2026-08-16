import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import OutcomeEditModal from './OutcomeEditModal';


describe('OutcomeEditModal', () => {
  it('edits outcome details and roadmap status together', () => {
    const onSave = vi.fn();
    const translations = {
      'goals.editOutcome': 'Edit Outcome',
      'goals.outcomeTitle': 'Outcome title',
      'goals.outcomeDescription': 'Description',
      'goals.outcomeStatus': 'Outcome status',
      'goals.saveOutcome': 'Save Outcome',
      'goals.outcomeStatus.ongoing': 'Ongoing',
      'goals.outcomeStatus.done': 'Done',
    };
    render(
      <OutcomeEditModal
        outcome={{ id: 3, title: 'Launch the pilot', goal_text: 'Initial description' }}
        status="ongoing"
        onClose={vi.fn()}
        onSave={onSave}
        t={key => translations[key] || key}
      />,
    );

    fireEvent.change(screen.getByLabelText('Outcome status'), { target: { value: 'done' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Outcome' }));

    expect(onSave).toHaveBeenCalledWith({
      title: 'Launch the pilot',
      goal_text: 'Initial description',
      status: 'done',
    });
  });
});
