import { useState } from 'react';
import axios from 'axios';

export function useTodoOpportunities({ apiUrl, userNumber, fetchTasks, fetchFilters }) {
  const [showOpportunityModal, setShowOpportunityModal] = useState(false);
  const [opportunityLoading, setOpportunityLoading] = useState(false);
  const [opportunityError, setOpportunityError] = useState(null);
  const [opportunities, setOpportunities] = useState([]);
  const [opportunityActions, setOpportunityActions] = useState({});

  const closeOpportunityModal = () => {
    setShowOpportunityModal(false);
    setOpportunityLoading(false);
    setOpportunityError(null);
  };

  const openOpportunityModal = async () => {
    setShowOpportunityModal(true);
    setOpportunityLoading(true);
    setOpportunityError(null);
    setOpportunities([]);
    setOpportunityActions({});

    try {
      const response = await axios.post(`${apiUrl}/api/opportunities/generate`, {
        user_number: userNumber,
        surface: 'task_page',
        type: 'task',
        limit: 3
      });
      setOpportunities(response.data?.opportunities || []);
    } catch (err) {
      console.error('Error generating opportunities:', err);
      setOpportunityError(err.response?.data?.detail || 'Failed to generate opportunities');
    } finally {
      setOpportunityLoading(false);
    }
  };

  const updateOpportunityAction = (opportunityId, action) => {
    setOpportunityActions(prev => {
      const next = { ...prev, [opportunityId]: action };
      const allHandled = opportunities.length > 0 && opportunities.every(item => next[item.id]);
      if (allHandled) {
        setTimeout(() => closeOpportunityModal(), 600);
      }
      return next;
    });
  };

  const acceptOpportunity = async (opportunityId) => {
    setOpportunityActions(prev => ({ ...prev, [opportunityId]: 'working' }));
    try {
      await axios.post(`${apiUrl}/api/opportunities/${opportunityId}/accept`, {
        user_number: userNumber
      });
      await fetchTasks();
      await fetchFilters();
      updateOpportunityAction(opportunityId, 'accepted');
    } catch (err) {
      console.error('Error accepting opportunity:', err);
      setOpportunityError(err.response?.data?.detail || 'Failed to add opportunity to today');
      setOpportunityActions(prev => {
        const next = { ...prev };
        delete next[opportunityId];
        return next;
      });
    }
  };

  const declineOpportunity = async (opportunityId) => {
    setOpportunityActions(prev => ({ ...prev, [opportunityId]: 'working' }));
    try {
      await axios.post(`${apiUrl}/api/opportunities/${opportunityId}/decline`, {
        user_number: userNumber,
        reason: 'Declined from task page'
      });
      updateOpportunityAction(opportunityId, 'declined');
    } catch (err) {
      console.error('Error declining opportunity:', err);
      setOpportunityError(err.response?.data?.detail || 'Failed to decline opportunity');
      setOpportunityActions(prev => {
        const next = { ...prev };
        delete next[opportunityId];
        return next;
      });
    }
  };

  return {
    showOpportunityModal,
    opportunityLoading,
    opportunityError,
    opportunities,
    opportunityActions,
    openOpportunityModal,
    closeOpportunityModal,
    acceptOpportunity,
    declineOpportunity,
  };
}

export function useTodoFollowUp({
  apiUrl,
  userNumber,
  fetchTasks,
  fetchFilters,
  fetchMtnTrends,
  setTasks,
  setSortOrder,
}) {
  const [showFollowUpModal, setShowFollowUpModal] = useState(false);
  const [selectedFollowUpTask, setSelectedFollowUpTask] = useState(null);
  const [followUpDate, setFollowUpDate] = useState('');
  const [followUpError, setFollowUpError] = useState('');
  const [followUpSaving, setFollowUpSaving] = useState(false);

  const openFollowUpModal = (task) => {
    setSelectedFollowUpTask(task);
    setFollowUpDate('');
    setFollowUpError('');
    setShowFollowUpModal(true);
  };

  const closeFollowUpModal = () => {
    if (followUpSaving) return;
    setShowFollowUpModal(false);
    setSelectedFollowUpTask(null);
    setFollowUpDate('');
    setFollowUpError('');
  };

  const createFollowUp = async () => {
    if (!selectedFollowUpTask) return;
    if (!followUpDate) {
      setFollowUpError('Please select a follow-up date.');
      return;
    }

    setFollowUpSaving(true);
    setFollowUpError('');
    try {
      await axios.post(
        `${apiUrl}/api/tasks/${selectedFollowUpTask.id}/follow-up`,
        { follow_up_date: followUpDate },
        { params: { user_number: userNumber } }
      );
      setTasks(prevTasks => prevTasks.filter(task => task.id !== selectedFollowUpTask.id));
      setSortOrder(prevOrder => prevOrder.filter(id => id !== selectedFollowUpTask.id));
      setShowFollowUpModal(false);
      setSelectedFollowUpTask(null);
      setFollowUpDate('');
      await fetchTasks();
      await fetchFilters();
      fetchMtnTrends();
    } catch (err) {
      console.error('Error creating follow-up task:', err);
      setFollowUpError(err.response?.data?.detail || 'Unable to create follow-up task. Please try again.');
    } finally {
      setFollowUpSaving(false);
    }
  };

  return {
    showFollowUpModal,
    selectedFollowUpTask,
    followUpDate,
    followUpError,
    followUpSaving,
    setFollowUpDate,
    openFollowUpModal,
    closeFollowUpModal,
    createFollowUp,
  };
}

export function useTodoSelection() {
  const [selectedTasks, setSelectedTasks] = useState([]);
  const [selectionMode, setSelectionMode] = useState(false);
  const [showBulkActionModal, setShowBulkActionModal] = useState(false);

  const toggleTaskSelection = (taskId) => {
    setSelectedTasks(prev => {
      if (prev.includes(taskId)) {
        return prev.filter(id => id !== taskId);
      } else {
        return [...prev, taskId];
      }
    });
  };

  const enterSelectionMode = (taskId) => {
    setSelectionMode(true);
    setSelectedTasks([taskId]);
  };

  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedTasks([]);
  };

  return {
    selectedTasks,
    setSelectedTasks,
    selectionMode,
    setSelectionMode,
    showBulkActionModal,
    setShowBulkActionModal,
    toggleTaskSelection,
    enterSelectionMode,
    exitSelectionMode,
  };
}
