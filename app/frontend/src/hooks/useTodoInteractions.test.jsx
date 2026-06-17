import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import axios from 'axios';
import { useTodoFollowUp, useTodoOpportunities, useTodoSelection } from './useTodoInteractions';

vi.mock('axios', () => ({
  default: {
    post: vi.fn(),
  },
}));

describe('useTodoOpportunities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads generated opportunities and resets modal state', async () => {
    axios.post.mockResolvedValueOnce({
      data: { opportunities: [{ id: 1, title: 'Call sponsor' }] },
    });

    const { result } = renderHook(() => useTodoOpportunities({
      apiUrl: 'https://api.example',
      userNumber: 'u1',
      fetchTasks: vi.fn(),
      fetchFilters: vi.fn(),
    }));

    await act(async () => {
      await result.current.openOpportunityModal();
    });

    expect(axios.post).toHaveBeenCalledWith('https://api.example/api/opportunities/generate', {
      user_number: 'u1',
      surface: 'task_page',
      type: 'task',
      limit: 3,
    });
    expect(result.current.showOpportunityModal).toBe(true);
    expect(result.current.opportunityLoading).toBe(false);
    expect(result.current.opportunities).toEqual([{ id: 1, title: 'Call sponsor' }]);
    expect(result.current.opportunityActions).toEqual({});
  });

  it('shows generate errors returned by the API', async () => {
    axios.post.mockRejectedValueOnce({ response: { data: { detail: 'No ideas today' } } });

    const { result } = renderHook(() => useTodoOpportunities({
      apiUrl: 'https://api.example',
      userNumber: 'u1',
      fetchTasks: vi.fn(),
      fetchFilters: vi.fn(),
    }));

    await act(async () => {
      await result.current.openOpportunityModal();
    });

    expect(result.current.opportunityError).toBe('No ideas today');
    expect(result.current.opportunityLoading).toBe(false);
  });

  it('accepts an opportunity, refreshes task context, and marks it accepted', async () => {
    axios.post
      .mockResolvedValueOnce({ data: { opportunities: [{ id: 4, title: 'Prepare deck' }] } })
      .mockResolvedValueOnce({});
    const fetchTasks = vi.fn().mockResolvedValue();
    const fetchFilters = vi.fn().mockResolvedValue();

    const { result } = renderHook(() => useTodoOpportunities({
      apiUrl: 'https://api.example',
      userNumber: 'u1',
      fetchTasks,
      fetchFilters,
    }));

    await act(async () => {
      await result.current.openOpportunityModal();
      await result.current.acceptOpportunity(4);
    });

    expect(axios.post).toHaveBeenLastCalledWith('https://api.example/api/opportunities/4/accept', {
      user_number: 'u1',
    });
    expect(fetchTasks).toHaveBeenCalledTimes(1);
    expect(fetchFilters).toHaveBeenCalledTimes(1);
    expect(result.current.opportunityActions[4]).toBe('accepted');
  });

  it('decline failures restore the action button and expose an error', async () => {
    axios.post
      .mockResolvedValueOnce({ data: { opportunities: [{ id: 4, title: 'Prepare deck' }] } })
      .mockRejectedValueOnce({ response: { data: { detail: 'Could not decline' } } });

    const { result } = renderHook(() => useTodoOpportunities({
      apiUrl: 'https://api.example',
      userNumber: 'u1',
      fetchTasks: vi.fn(),
      fetchFilters: vi.fn(),
    }));

    await act(async () => {
      await result.current.openOpportunityModal();
      await result.current.declineOpportunity(4);
    });

    expect(result.current.opportunityError).toBe('Could not decline');
    expect(result.current.opportunityActions[4]).toBeUndefined();
  });
});

describe('useTodoFollowUp', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderFollowUpHook = (overrides = {}) => renderHook(() => useTodoFollowUp({
    apiUrl: 'https://api.example',
    userNumber: 'u1',
    fetchTasks: vi.fn().mockResolvedValue(),
    fetchFilters: vi.fn().mockResolvedValue(),
    fetchMtnTrends: vi.fn(),
    setTasks: vi.fn(update => update([{ id: 9 }, { id: 10 }])),
    setSortOrder: vi.fn(update => update([9, 10])),
    ...overrides,
  }));

  it('opens, validates, and closes the follow-up modal', async () => {
    const { result } = renderFollowUpHook();

    act(() => {
      result.current.openFollowUpModal({ id: 9, title: 'Send recap' });
    });

    expect(result.current.showFollowUpModal).toBe(true);
    expect(result.current.selectedFollowUpTask.title).toBe('Send recap');

    await act(async () => {
      await result.current.createFollowUp();
    });

    expect(result.current.followUpError).toBe('Please select a follow-up date.');

    act(() => {
      result.current.closeFollowUpModal();
    });

    expect(result.current.showFollowUpModal).toBe(false);
  });

  it('creates a follow-up and refreshes dependent task data', async () => {
    axios.post.mockResolvedValueOnce({});
    const fetchTasks = vi.fn().mockResolvedValue();
    const fetchFilters = vi.fn().mockResolvedValue();
    const fetchMtnTrends = vi.fn();
    const setTasks = vi.fn(update => update([{ id: 9 }, { id: 10 }]));
    const setSortOrder = vi.fn(update => update([9, 10]));

    const { result } = renderFollowUpHook({
      fetchTasks,
      fetchFilters,
      fetchMtnTrends,
      setTasks,
      setSortOrder,
    });

    act(() => {
      result.current.openFollowUpModal({ id: 9, title: 'Send recap' });
      result.current.setFollowUpDate('2026-06-16');
    });

    await act(async () => {
      await result.current.createFollowUp();
    });

    expect(axios.post).toHaveBeenCalledWith(
      'https://api.example/api/tasks/9/follow-up',
      { follow_up_date: '2026-06-16' },
      { params: { user_number: 'u1' } }
    );
    expect(setTasks).toHaveBeenCalled();
    expect(setSortOrder).toHaveBeenCalled();
    expect(fetchTasks).toHaveBeenCalledTimes(1);
    expect(fetchFilters).toHaveBeenCalledTimes(1);
    expect(fetchMtnTrends).toHaveBeenCalledTimes(1);
    expect(result.current.showFollowUpModal).toBe(false);
  });

  it('keeps the modal open and shows API errors when creation fails', async () => {
    axios.post.mockRejectedValueOnce({ response: { data: { detail: 'Cannot create follow-up' } } });

    const { result } = renderFollowUpHook();

    act(() => {
      result.current.openFollowUpModal({ id: 9, title: 'Send recap' });
      result.current.setFollowUpDate('2026-06-16');
    });

    await act(async () => {
      await result.current.createFollowUp();
    });

    expect(result.current.followUpError).toBe('Cannot create follow-up');
    expect(result.current.showFollowUpModal).toBe(true);
  });
});

describe('useTodoSelection', () => {
  it('enters, toggles, and exits selection mode', async () => {
    const { result } = renderHook(() => useTodoSelection());

    act(() => {
      result.current.enterSelectionMode(1);
    });

    expect(result.current.selectionMode).toBe(true);
    expect(result.current.selectedTasks).toEqual([1]);

    act(() => {
      result.current.toggleTaskSelection(2);
      result.current.toggleTaskSelection(1);
      result.current.setShowBulkActionModal(true);
    });

    await waitFor(() => {
      expect(result.current.selectedTasks).toEqual([2]);
    });
    expect(result.current.showBulkActionModal).toBe(true);

    act(() => {
      result.current.exitSelectionMode();
    });

    expect(result.current.selectionMode).toBe(false);
    expect(result.current.selectedTasks).toEqual([]);
  });
});
