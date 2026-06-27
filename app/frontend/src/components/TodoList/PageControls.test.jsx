import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  DeferNonTop10Modal,
  FloatingSelectionBar,
  FollowUpModal,
  OpportunityModal,
  TaskColumnHeader,
  TodoPageHeader,
  TodoTabs,
} from './PageControls';

describe('TodoPageHeader', () => {
  it('renders task actions and calls the provided handlers', () => {
    const handlers = {
      onResetSort: vi.fn(),
      onSetOverdueToToday: vi.fn(),
      onRunPrioritization: vi.fn(),
      onOpenOpportunityModal: vi.fn(),
      onOpenDeferModal: vi.fn(),
      onAddTask: vi.fn(),
    };

    render(
      <TodoPageHeader
        title="Tasks"
        selectionMode={false}
        selectedCount={0}
        activeTab="tasks"
        sortOrderCount={2}
        taskCount={12}
        sortedTaskCount={12}
        priorityLoading={false}
        opportunityLoading={false}
        mtnNeedle={<div>Needle</div>}
        {...handlers}
      />
    );

    expect(screen.getByText('Tasks')).toBeInTheDocument();
    expect(screen.getByText('Needle')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Reset manual sort' }));
    fireEvent.click(screen.getByRole('button', { name: 'Move overdue tasks to today' }));
    fireEvent.click(screen.getByRole('button', { name: 'Prioritize tasks' }));
    fireEvent.click(screen.getByRole('button', { name: 'Suggest move-the-needle actions' }));
    fireEvent.click(screen.getByRole('button', { name: 'Move non-Top-10 tasks to tomorrow' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add task' }));

    expect(handlers.onResetSort).toHaveBeenCalledTimes(1);
    expect(handlers.onSetOverdueToToday).toHaveBeenCalledTimes(1);
    expect(handlers.onRunPrioritization).toHaveBeenCalledTimes(1);
    expect(handlers.onOpenOpportunityModal).toHaveBeenCalledTimes(1);
    expect(handlers.onOpenDeferModal).toHaveBeenCalledTimes(1);
    expect(handlers.onAddTask).toHaveBeenCalledTimes(1);
  });

  it('hides task actions and shows selection count in selection mode', () => {
    render(
      <TodoPageHeader
        title="Tasks"
        selectionMode
        selectedCount={3}
        activeTab="tasks"
        sortOrderCount={1}
        taskCount={12}
        sortedTaskCount={12}
        priorityLoading={false}
        opportunityLoading={false}
        mtnNeedle={<div>Needle</div>}
        onResetSort={() => {}}
        onSetOverdueToToday={() => {}}
        onRunPrioritization={() => {}}
        onOpenOpportunityModal={() => {}}
        onOpenDeferModal={() => {}}
        onAddTask={() => {}}
      />
    );

    expect(screen.getByText('3 task(s) selected')).toBeInTheDocument();
    expect(screen.queryByText('Needle')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add task' })).not.toBeInTheDocument();
  });
});

describe('TodoTabs and TaskColumnHeader', () => {
  it('changes tabs through the provided callback', () => {
    const onChangeTab = vi.fn();

    render(<TodoTabs activeTab="tasks" showTaskTrends onChangeTab={onChangeTab} />);

    fireEvent.click(screen.getByRole('button', { name: 'Calendar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Trends' }));

    expect(screen.getByRole('button', { name: 'List' })).toBeInTheDocument();
    expect(onChangeTab).toHaveBeenNthCalledWith(1, 'calendar');
    expect(onChangeTab).toHaveBeenNthCalledWith(2, 'trends');
  });

  it('sorts task columns through the provided callback', () => {
    const onSort = vi.fn();

    render(<TaskColumnHeader columnSort={{ key: 'importance', direction: 'desc' }} onSort={onSort} />);

    fireEvent.click(screen.getAllByRole('button', { name: 'Sort by urgency' })[0]);
    fireEvent.click(screen.getAllByRole('button', { name: 'Sort by importance' })[0]);

    expect(onSort).toHaveBeenNthCalledWith(1, 'urgency');
    expect(onSort).toHaveBeenNthCalledWith(2, 'importance');
  });
});

describe('FloatingSelectionBar and DeferNonTop10Modal', () => {
  it('renders selected count and selection actions', () => {
    const onCancel = vi.fn();
    const onEditSelected = vi.fn();

    render(<FloatingSelectionBar selectedCount={2} onCancel={onCancel} onEditSelected={onEditSelected} />);

    fireEvent.click(screen.getByText('Cancel'));
    fireEvent.click(screen.getByText('Edit Selected'));

    expect(screen.getByText('2 selected')).toBeInTheDocument();
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onEditSelected).toHaveBeenCalledTimes(1);
  });

  it('renders defer count and loading state', () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();

    const { rerender } = render(
      <DeferNonTop10Modal taskCount={14} loading={false} onCancel={onCancel} onConfirm={onConfirm} />
    );

    expect(screen.getByText(/remaining 4 task\(s\)/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('Move to Tomorrow'));
    expect(onConfirm).toHaveBeenCalledTimes(1);

    rerender(<DeferNonTop10Modal taskCount={14} loading onCancel={onCancel} onConfirm={onConfirm} />);
    expect(screen.getByText('Moving...')).toBeDisabled();
  });
});

describe('OpportunityModal', () => {
  const opportunities = [{
    id: 10,
    title: 'Call the launch sponsor',
    description: 'Confirm timing',
    rationale: 'Unblocks the team',
    mtn_score: 8.25,
    domain: 'Strategy',
    linked_goal_id: 3,
  }];

  it('renders loading, empty, and error states', () => {
    const { rerender } = render(
      <OpportunityModal
        opportunities={[]}
        opportunityActions={{}}
        goals={[]}
        loading
        error={null}
        onClose={() => {}}
        onAccept={() => {}}
        onDecline={() => {}}
      />
    );

    expect(screen.getAllByText("Alfred is looking for today's highest-leverage moves...")).toHaveLength(2);

    rerender(
      <OpportunityModal
        opportunities={[]}
        opportunityActions={{}}
        goals={[]}
        loading={false}
        error={null}
        onClose={() => {}}
        onAccept={() => {}}
        onDecline={() => {}}
      />
    );
    expect(screen.getByText('No recommendations came back this time.')).toBeInTheDocument();

    rerender(
      <OpportunityModal
        opportunities={[]}
        opportunityActions={{}}
        goals={[]}
        loading={false}
        error="Could not generate"
        onClose={() => {}}
        onAccept={() => {}}
        onDecline={() => {}}
      />
    );
    expect(screen.getByText('Could not generate')).toBeInTheDocument();
  });

  it('renders opportunities and dispatches accept/decline actions', () => {
    const onAccept = vi.fn();
    const onDecline = vi.fn();
    const onClose = vi.fn();

    render(
      <OpportunityModal
        opportunities={opportunities}
        opportunityActions={{}}
        goals={[{ id: 3, title: 'Launch well' }]}
        loading={false}
        error={null}
        onClose={onClose}
        onAccept={onAccept}
        onDecline={onDecline}
      />
    );

    expect(screen.getByText('Call the launch sponsor')).toBeInTheDocument();
    expect(screen.getByText('8.3')).toBeInTheDocument();
    expect(screen.getByText('Strategy')).toBeInTheDocument();
    expect(screen.getByText('Launch well')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Add to today'));
    fireEvent.click(screen.getByText('Decline'));
    fireEvent.click(screen.getByRole('button', { name: 'Close recommendations' }));

    expect(onAccept).toHaveBeenCalledWith(10);
    expect(onDecline).toHaveBeenCalledWith(10);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders handled opportunity states without action buttons', () => {
    const { rerender } = render(
      <OpportunityModal
        opportunities={opportunities}
        opportunityActions={{ 10: 'accepted' }}
        goals={[]}
        loading={false}
        error={null}
        onClose={() => {}}
        onAccept={() => {}}
        onDecline={() => {}}
      />
    );

    expect(screen.getByText('Added to today')).toBeInTheDocument();

    rerender(
      <OpportunityModal
        opportunities={opportunities}
        opportunityActions={{ 10: 'declined' }}
        goals={[]}
        loading={false}
        error={null}
        onClose={() => {}}
        onAccept={() => {}}
        onDecline={() => {}}
      />
    );
    expect(screen.getByText('Declined')).toBeInTheDocument();
  });
});

describe('FollowUpModal', () => {
  it('renders the follow-up task and date picker, then selects a date', () => {
    const setFollowUpDate = vi.fn();
    const onCancel = vi.fn();
    const onConfirm = vi.fn();

    render(
      <FollowUpModal
        task={{ id: 1, title: 'Send recap' }}
        followUpDate=""
        setFollowUpDate={setFollowUpDate}
        todayKey="2026-06-15"
        error=""
        saving={false}
        onCancel={onCancel}
        onConfirm={onConfirm}
      />
    );

    expect(screen.getByText('Send recap')).toBeInTheDocument();
    expect(screen.getByText('Jun 15 - Jul 14, 2026')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '15' }));
    fireEvent.click(screen.getByText('OK'));
    fireEvent.click(screen.getByRole('button', { name: 'Close follow-up' }));

    expect(setFollowUpDate).toHaveBeenCalledWith('2026-06-15');
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('shows error and saving states', () => {
    render(
      <FollowUpModal
        task={{ id: 1, title: 'Send recap' }}
        followUpDate="2026-06-16"
        setFollowUpDate={() => {}}
        todayKey="2026-06-15"
        error="Please select a follow-up date."
        saving
        onCancel={() => {}}
        onConfirm={() => {}}
      />
    );

    expect(screen.getByText('Please select a follow-up date.')).toBeInTheDocument();
    expect(screen.getByText('Creating...')).toBeDisabled();
  });
});
