// frontend/src/components/TodoList.jsx
import { Component, useState, useEffect, useRef } from 'react';
import { DragDropContext, Droppable } from 'react-beautiful-dnd';
import axios from 'axios';
import TaskItem from './TodoList/TaskItem';
import TaskModal from './TodoList/TaskModal';
import BulkActionModal from './TodoList/BulkActionModal';
import FilterSection from './TodoList/FilterSection';
import TrendRangeToggle from './TrendRangeToggle';
import { getTodayET, getETDate, formatDateForInput, isOverdueET, getSortedGoals, getLongTermGoals, getMtnLabel, MTN_TAG_OPTIONS } from '../utils/taskHelpers';
import { useLanguage } from '../i18n/LanguageContext';
import { usePriority } from '../hooks/usePriority';

/**
 * TodoList Component - Main Task Management Interface
 * 
 * Features:
 * - Task display with Top 10 prioritization
 * - Drag-and-drop reordering
 * - Multi-select for bulk actions
 * - Filtering (date, project, delegate, goal)
 * - Task CRUD operations
 * - Mobile-responsive with touch gestures
 * - 1500ms completion animation
 */
export default function TodoList({ apiUrl, userNumber }) {
  const { t, timezone } = useLanguage();
  const showTaskTrends = true;
  // Task data
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Filters
  const [filterType, setFilterType] = useState('due_today');
  const [selectedProject, setSelectedProject] = useState('');
  const [selectedDelegate, setSelectedDelegate] = useState('');
  const [selectedGoal, setSelectedGoal] = useState('');
  const [selectedMtnTags, setSelectedMtnTags] = useState([]);
  const [projects, setProjects] = useState([]);
  const [delegates, setDelegates] = useState([]);
  const [goals, setGoals] = useState([]);
  
  // UI state
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [sortOrder, setSortOrder] = useState([]);
  const [completingTasks, setCompletingTasks] = useState([]);
  const [filtersCollapsed, setFiltersCollapsed] = useState(true);
  const [showOpportunityModal, setShowOpportunityModal] = useState(false);
  const [opportunityLoading, setOpportunityLoading] = useState(false);
  const [opportunityError, setOpportunityError] = useState(null);
  const [opportunities, setOpportunities] = useState([]);
  const [opportunityActions, setOpportunityActions] = useState({});
  const [showDeferModal, setShowDeferModal] = useState(false);
  const [deferLoading, setDeferLoading] = useState(false);
  const [showFollowUpModal, setShowFollowUpModal] = useState(false);
  const [selectedFollowUpTask, setSelectedFollowUpTask] = useState(null);
  const [followUpDate, setFollowUpDate] = useState('');
  const [followUpError, setFollowUpError] = useState('');
  const [followUpSaving, setFollowUpSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('tasks');
  const [mtnTrends, setMtnTrends] = useState(null);
  const [mtnTrendsLoading, setMtnTrendsLoading] = useState(false);
  const [mtnTrendsError, setMtnTrendsError] = useState(null);
  const [showMtnBreakdown, setShowMtnBreakdown] = useState(false);
  const [todayKey, setTodayKey] = useState(getTodayET(timezone));
  const mtnBackfillRequestsRef = useRef(new Set());

  // Multi-select state
  const [selectedTasks, setSelectedTasks] = useState([]);
  const [selectionMode, setSelectionMode] = useState(false);
  const [showBulkActionModal, setShowBulkActionModal] = useState(false);

  // Optional strategic prioritization lens
  const {
    priorityMode,
    priorityLoading,
    priorityRecommendation,
    runPrioritization,
    submitMtnFeedback,
    getTaskScore
  } = usePriority(apiUrl, userNumber);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      setFilterType('due_today');
      setSelectedProject('');
      setSelectedDelegate('');
      setSelectedGoal('');
      setSelectedMtnTags([]);
      setSelectedTasks([]);
      setSelectionMode(false);
    };
  }, []);

  // Read goal filter from URL parameter on mount AND when URL changes
  useEffect(() => {
    const readUrlParams = () => {
      const params = new URLSearchParams(window.location.search);
      const goalParam = params.get('goal');
      if (goalParam) {
        setSelectedGoal(goalParam);
        setFiltersCollapsed(false); // Expand filters to show the active goal filter
      }
    };

    readUrlParams();
    window.addEventListener('urlchange', readUrlParams);

    return () => {
      window.removeEventListener('urlchange', readUrlParams);
    };
  }, []);

  // Load saved sort order
  useEffect(() => {
    const saved = localStorage.getItem('taskSortOrder');
    if (saved) {
      setSortOrder(JSON.parse(saved));
    }
  }, []);

  // Initial data fetching
  useEffect(() => {
    if (apiUrl == null || !userNumber) return;
    fetchFilters();
    fetchGoals();
    fetchMtnTrends();
  }, [apiUrl, userNumber]);

  // Refetch tasks when filters change
  useEffect(() => {
    if (apiUrl == null || !userNumber) {
      setLoading(false);
      return;
    }
    fetchTasks();
  }, [apiUrl, userNumber, filterType, selectedProject, selectedDelegate, selectedGoal, timezone]);

  useEffect(() => {
    if (apiUrl == null || !userNumber) return;
    setTodayKey(getTodayET(timezone));
    const timer = setInterval(() => {
      const currentToday = getTodayET(timezone);
      setTodayKey(previousToday => {
        if (previousToday !== currentToday) {
          fetchTasks();
          fetchMtnTrends();
          return currentToday;
        }
        return previousToday;
      });
    }, 60000);

    return () => clearInterval(timer);
  }, [apiUrl, userNumber, timezone]);

  // ============================================================================
  // DATA FETCHING
  // ============================================================================

  const fetchFilters = async () => {
    if (apiUrl == null || !userNumber) return;
    try {
      const response = await axios.get(`${apiUrl}/api/tasks/filters`, {
        params: { user_number: userNumber }
      });
      if (response.data) {
        setProjects(response.data.projects || []);
        setDelegates(response.data.delegates || []);
      }
    } catch (err) {
      console.error('Error fetching filters:', err);
    }
  };

  const fetchGoals = async () => {
    if (apiUrl == null || !userNumber) return;
    try {
      const response = await axios.get(`${apiUrl}/api/journey/goals`, {
        params: { user_number: userNumber }
      });
      if (response.data && Array.isArray(response.data)) {
        setGoals(response.data);
      }
    } catch (err) {
      console.error('Error fetching goals:', err);
    }
  };

  const fetchTasks = async ({ skipMtnBackfill = false } = {}) => {
    if (apiUrl == null || !userNumber) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const params = {
        user_number: userNumber,
        // If a goal is selected, show ALL tasks for that goal, not just due today
        filter_type: selectedGoal ? 'all' : filterType
      };
      if (selectedProject) params.project = selectedProject;
      if (selectedDelegate) params.delegated_to = selectedDelegate;
      if (selectedGoal) params.goal_id = parseInt(selectedGoal);

      const response = await axios.get(`${apiUrl}/api/tasks/`, { params });
      const taskList = Array.isArray(response.data) ? response.data : [];
      const openTasks = taskList.filter(task => String(task.status || '').toLowerCase() !== 'completed');
      setTasks(openTasks);
      if (!skipMtnBackfill) {
        backfillMissingMtnScores(openTasks);
      }
    } catch (err) {
      console.error('Error fetching tasks:', err);
      setError(err.response?.data?.detail || 'Failed to load tasks');
    } finally {
      setLoading(false);
    }
  };

  const hasTodayMtnScore = (task) => {
    return task.mtn_score_today !== null && task.mtn_score_today !== undefined;
  };

  const backfillMissingMtnScores = async (visibleTasks) => {
    if (apiUrl == null || !userNumber || !Array.isArray(visibleTasks) || visibleTasks.length === 0) return;

    const taskIds = visibleTasks
      .filter(task => task?.id && String(task.status || 'open').toLowerCase() !== 'completed')
      .filter(task => !hasTodayMtnScore(task))
      .map(task => task.id);

    if (taskIds.length === 0) return;

    const signature = `${todayKey}:${taskIds.slice().sort((a, b) => a - b).join(',')}`;
    if (mtnBackfillRequestsRef.current.has(signature)) return;
    mtnBackfillRequestsRef.current.add(signature);

    try {
      const response = await axios.post(`${apiUrl}/api/priority/backfill-task-scores`, {
        user_number: userNumber,
        task_ids: taskIds
      });

      if (Number(response.data?.scored || 0) > 0) {
        await fetchTasks({ skipMtnBackfill: true });
        if (showTaskTrends) fetchMtnTrends();
      }
    } catch (err) {
      console.error('MTN backfill failed:', err);
      mtnBackfillRequestsRef.current.delete(signature);
    }
  };

  const fetchMtnTrends = async () => {
    if (apiUrl == null || !userNumber) return;
    setMtnTrendsLoading(true);
    setMtnTrendsError(null);
    try {
      const response = await axios.get(`${apiUrl}/api/tasks/mtn-trends`, {
        params: { user_number: userNumber },
      });
      setMtnTrends(response.data);
    } catch (err) {
      console.error('Error fetching MTN trends:', err);
      setMtnTrendsError('Unable to load MTN trends right now.');
    } finally {
      setMtnTrendsLoading(false);
    }
  };

  // ============================================================================
  // TASK SORTING
  // ============================================================================

  const getStoredTaskScore = (task) => {
    const rawScore = task.mtn_score_today ?? task.move_the_needle_score;
    if (rawScore === null || rawScore === undefined) return null;
    const numericScore = Number(rawScore);
    if (Number.isNaN(numericScore)) return null;

    return {
      task_id: task.id,
      title: task.title,
      score: numericScore > 1 ? numericScore / 10 : numericScore,
      reason: task.mtn_reason_today || task.strategic_intent || 'Alfred prioritized this from your todo list.',
      risk_if_ignored: task.mtn_risk_today || null,
      confidence: 'medium',
      rank: task.mtn_rank_today ?? task.top10_position ?? null,
      is_top_mtn: Boolean(task.mtn_recommended_today),
      recommendation_id: task.mtn_recommendation_id || null
    };
  };

  const getVisibleTaskScore = (task) => {
    return getTaskScore(task.id) || getStoredTaskScore(task);
  };

  const taskMatchesSelectedMtnTags = (task) => {
    if (selectedMtnTags.length === 0) return true;
    const scoreData = getVisibleTaskScore(task);
    if (!scoreData) return false;
    return selectedMtnTags.includes(getMtnLabel(scoreData.score));
  };

  const getVisibleTasks = () => {
    return tasks.filter(taskMatchesSelectedMtnTags);
  };

  const hasStoredMtnScoring = () => {
    return getVisibleTasks().some(task => Boolean(getVisibleTaskScore(task)));
  };

  const saveSortOrder = (order) => {
    localStorage.setItem('taskSortOrder', JSON.stringify(order));
    setSortOrder(order);

    axios.post(`${apiUrl}/api/tasks/reorder`, {
      user_number: userNumber,
      ordered_task_ids: order
    }).catch(err => {
      console.error('Failed to persist task order:', err);
    });
  };

  const getSortedTasks = () => {
    const visibleTasks = getVisibleTasks();

    // Manual drag-and-drop order should always win once it exists. MTN scores
    // still render as labels, but they should not lock the list order.
    if (sortOrder.length > 0) {
      return [...visibleTasks].sort((a, b) => {
        const indexA = sortOrder.indexOf(a.id);
        const indexB = sortOrder.indexOf(b.id);
        
        if (indexA !== -1 && indexB !== -1) {
          return indexA - indexB;
        }
        if (indexA !== -1) return -1;
        if (indexB !== -1) return 1;
        return 0;
      });
    }

    const persistedOrderValues = visibleTasks
      .map(task => task.sort_order)
      .filter(order => order !== null && order !== undefined);
    const hasPersistedTaskOrder = new Set(persistedOrderValues).size > 1;
    if (hasPersistedTaskOrder) {
      return [...visibleTasks].sort((a, b) => {
        const orderA = a.sort_order ?? 999999;
        const orderB = b.sort_order ?? 999999;
        if (orderA !== orderB) return orderA - orderB;
        return 0;
      });
    }

    if (hasStoredMtnScoring()) {
      return [...visibleTasks].sort((a, b) => {
        const scoreA = getVisibleTaskScore(a);
        const scoreB = getVisibleTaskScore(b);

        if (scoreA && scoreB) {
          const rankA = scoreA.rank ?? 999;
          const rankB = scoreB.rank ?? 999;
          if (rankA !== rankB) return rankA - rankB;
          return (scoreB.score ?? 0) - (scoreA.score ?? 0);
        }
        if (scoreA) return -1;
        if (scoreB) return 1;
        return 0;
      });
    }
    
    // Default sorting: Top 10 first, then by priority (High > Medium > Low)
    return [...visibleTasks].sort((a, b) => {
      // 1. Top 10 tasks always come first
      if (a.in_top10 && !b.in_top10) return -1;
      if (!a.in_top10 && b.in_top10) return 1;
      
      // 2. Within Top 10, sort by position
      if (a.in_top10 && b.in_top10) {
        const posA = a.top10_position ?? 999;
        const posB = b.top10_position ?? 999;
        return posA - posB;
      }
      
      // 3. For non-Top 10 tasks, sort by priority (High=0, Medium=1, Low=2)
      const priorityOrder = { 'high': 0, 'medium': 1, 'low': 2 };
      const aPriority = priorityOrder[a.priority?.toLowerCase()] ?? 3;
      const bPriority = priorityOrder[b.priority?.toLowerCase()] ?? 3;
      
      if (aPriority !== bPriority) {
        return aPriority - bPriority;
      }
      
      // 4. If same priority, sort by due date (earlier first)
      if (a.due_date && b.due_date) {
        return new Date(a.due_date) - new Date(b.due_date);
      }
      if (a.due_date) return -1;
      if (b.due_date) return 1;
      
      return 0;
    });
  };

  const handleDragEnd = (result) => {
    if (!result.destination) return;

    const items = Array.from(getSortedTasks());
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);

    const newOrder = items.map(task => task.id);
    saveSortOrder(newOrder);
  };

  // ============================================================================
  // TASK OPERATIONS
  // ============================================================================

  const toggleTaskComplete = async (taskId) => {
    setCompletingTasks(prev => [...prev, taskId]);
    
    try {
      await axios.patch(
        `${apiUrl}/api/tasks/${taskId}/toggle`,
        {},
        { params: { user_number: userNumber } }
      );
      
      // 1500ms animation before removing from UI
      setTimeout(() => {
        setTasks(prevTasks => prevTasks.filter(t => t.id !== taskId));
        setCompletingTasks(prev => prev.filter(id => id !== taskId));
        fetchMtnTrends();
      }, 1500);
    } catch (err) {
      console.error('Error toggling task:', err);
      setCompletingTasks(prev => prev.filter(id => id !== taskId));
      alert('Failed to update task');
    }
  };

  const deleteTask = async (taskId) => {
    if (!confirm('Delete this task?')) return;
    
    try {
      await axios.delete(`${apiUrl}/api/tasks/${taskId}`, {
        params: { user_number: userNumber }
      });
      setTasks(prevTasks => prevTasks.filter(t => t.id !== taskId));
      setSortOrder(sortOrder.filter(id => id !== taskId));
    } catch (err) {
      console.error('Error deleting task:', err);
      alert('Failed to delete task');
    }
  };

  const updateTask = async (taskId, updates) => {
    try {
      await axios.put(
        `${apiUrl}/api/tasks/${taskId}`,
        updates,
        { params: { user_number: userNumber } }
      );
      await fetchTasks();
      setShowTaskModal(false);
      setEditingTask(null);
    } catch (err) {
      console.error('Error updating task:', err);
      alert('Failed to update task');
    }
  };

  const addTask = async (taskData) => {
    try {
      await axios.post(
        `${apiUrl}/api/tasks/`,
        taskData,
        { params: { user_number: userNumber } }
      );
      await fetchTasks();
      setShowTaskModal(false);
    } catch (err) {
      console.error('Error adding task:', err);
      alert('Failed to add task');
    }
  };

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

  // ============================================================================
  // OPPORTUNITY OPERATIONS
  // ============================================================================

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

  const closeOpportunityModal = () => {
    setShowOpportunityModal(false);
    setOpportunityLoading(false);
    setOpportunityError(null);
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

  // ============================================================================
  // FILTER OPERATIONS
  // ============================================================================

  const clearFilters = () => {
    setFilterType('due_today');
    setSelectedProject('');
    setSelectedDelegate('');
    setSelectedGoal('');
    setSelectedMtnTags([]);
  };

  const toggleMtnTagFilter = (tag) => {
    setSelectedMtnTags(previousTags =>
      previousTags.includes(tag)
        ? previousTags.filter(currentTag => currentTag !== tag)
        : [...previousTags, tag]
    );
  };

  const resetSortOrder = () => {
    localStorage.removeItem('taskSortOrder');
    setSortOrder([]);
    axios.post(`${apiUrl}/api/tasks/reorder/reset`, null, {
      params: { user_number: userNumber }
    }).catch(err => {
      console.error('Failed to reset persisted task order:', err);
    });
  };

  const setOverdueToToday = async () => {
    const overdueTasks = tasks.filter(t => isOverdueET(t.due_date, timezone));
    if (overdueTasks.length === 0) {
      alert('No overdue tasks found');
      return;
    }

    if (!confirm(`Set ${overdueTasks.length} overdue task(s) to today?`)) return;

    const today = getTodayET(timezone);
    try {
      await Promise.all(
        overdueTasks.map(task =>
          axios.put(
            `${apiUrl}/api/tasks/${task.id}`,
            { due_date: today },
            { params: { user_number: userNumber } }
          )
        )
      );
      await fetchTasks();
    } catch (err) {
      console.error('Error updating overdue tasks:', err);
      alert('Failed to update some tasks');
    }
  };

  const getTomorrowET = () => {
    const tomorrow = getETDate(timezone);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return formatDateForInput(tomorrow);
  };

  const openDeferNonTop10Modal = () => {
    if (sortedTasks.length <= 10) {
      alert('There are no tasks outside the current Top 10.');
      return;
    }
    setShowDeferModal(true);
  };

  const deferNonTop10Tasks = async () => {
    const currentOrder = getSortedTasks();
    const tasksToKeepToday = currentOrder.slice(0, 10);
    const tasksToMove = currentOrder.slice(10);

    if (tasksToMove.length === 0) {
      setShowDeferModal(false);
      alert('There are no tasks outside the current Top 10.');
      return;
    }

    setDeferLoading(true);
    try {
      const targetDate = getTomorrowET();
      const response = await axios.post(
        `${apiUrl}/api/tasks/bulk-defer-non-top-10`,
        {
          task_ids_to_keep_today: tasksToKeepToday.map(task => task.id),
          task_ids_to_move: tasksToMove.map(task => task.id),
          target_date: targetDate
        },
        { params: { user_number: userNumber } }
      );

      await fetchTasks();
      setShowDeferModal(false);
      alert(`Moved ${response.data?.updated ?? tasksToMove.length} task(s) to tomorrow.`);
    } catch (err) {
      console.error('Error deferring non-Top-10 tasks:', err);
      alert(err.response?.data?.detail || 'Failed to move tasks to tomorrow');
    } finally {
      setDeferLoading(false);
    }
  };

  // ============================================================================
  // MULTI-SELECT OPERATIONS
  // ============================================================================

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

  const applyBulkAction = async (updates) => {
    try {
      await Promise.all(
        selectedTasks.map(taskId =>
          axios.put(
            `${apiUrl}/api/tasks/${taskId}`,
            updates,
            { params: { user_number: userNumber } }
          )
        )
      );
      await fetchTasks();
      exitSelectionMode();
      setShowBulkActionModal(false);
    } catch (err) {
      console.error('Error applying bulk action:', err);
      alert('Failed to update some tasks');
    }
  };

  // ============================================================================
  // STRATEGIC VIEW OPERATIONS
  // ============================================================================

  const handleRunPrioritization = async () => {
    const result = await runPrioritization();
    if (!result.success) {
      setError(result.error);
    }
  };

  const handleApplyPrioritySort = () => {
    const scoredTasks = priorityRecommendation?.all_scored_tasks || [];
    const scoredOrder = [...scoredTasks]
      .sort((a, b) => b.score - a.score)
      .map(scoredTask => scoredTask.task_id);
    const scoredIds = new Set(scoredOrder);
    const remainingTaskIds = tasks
      .filter(task => !scoredIds.has(task.id))
      .map(task => task.id);
    const newOrder = [...scoredOrder, ...remainingTaskIds];
    saveSortOrder(newOrder);
  };

  useEffect(() => {
    if (priorityMode && priorityRecommendation?.all_scored_tasks) {
      handleApplyPrioritySort();
    }
  }, [priorityMode, priorityRecommendation]);

  const handleMtnFeedback = async (taskId, rating, feedback, tag, recommendationId) => {
    const result = await submitMtnFeedback(taskId, rating, feedback, tag, recommendationId);
    if (!result.success) {
      alert(result.error);
    }
    return result;
  };

  // ============================================================================
  // COMPUTED VALUES
  // ============================================================================

  const hasActiveFilters = selectedProject || selectedDelegate || selectedGoal || selectedMtnTags.length > 0 || filterType !== 'due_today';
  const sortedTasks = getSortedTasks();
  const todayMtnScore = Number(mtnTrends?.summary?.today?.mtn_score || 0);
  const todayCompletedTasks = Number(mtnTrends?.summary?.today?.completed_tasks || 0);
  const todayMtnTasks = Array.isArray(mtnTrends?.summary?.today?.tasks)
    ? mtnTrends.summary.today.tasks
    : [];
  const mtnBenchmark = buildDailyMtnBenchmark(mtnTrends);

  // ============================================================================
  // RENDER
  // ============================================================================

  if (loading) {
    return (
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-7xl mx-auto p-6">
        {/* Header */}
        <div className="mb-6 grid grid-cols-1 items-start gap-4 lg:grid-cols-[1fr_auto_1fr]">
          <div className="min-w-0">
            <h1 className="text-3xl font-bold text-slate-800 hidden lg:block">
              {t('tasks.title')}
            </h1>
            <p className="text-slate-600 mt-1">
              {selectionMode ? (
                <span className="text-blue-600 font-medium">
                  {selectedTasks.length} task(s) selected
                </span>
              ) : (
                'Move the needle'
              )}
            </p>
          </div>
          {!selectionMode && (
            <div className="flex justify-center pt-9">
              <DailyMtnNeedle
                score={todayMtnScore}
                completedTasks={todayCompletedTasks}
                benchmark={mtnBenchmark}
                onClick={() => setShowMtnBreakdown(true)}
              />
            </div>
          )}
          <div className="flex justify-end">
            <div className="flex flex-wrap justify-end gap-2">
              {sortOrder.length > 0 && !selectionMode && activeTab === 'tasks' && (
                <button
                  onClick={resetSortOrder}
                  className="h-10 w-10 inline-flex items-center justify-center bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors"
                  title="Reset manual sort"
                  aria-label="Reset manual sort"
                >
                  <ResetIcon />
                </button>
              )}
              {!selectionMode && activeTab === 'tasks' && (
                <>
                  <button
                    onClick={setOverdueToToday}
                    className="h-10 w-10 inline-flex items-center justify-center bg-orange-500 hover:bg-orange-600 text-white rounded-lg transition-colors"
                    title="Move overdue tasks to today"
                    aria-label="Move overdue tasks to today"
                  >
                    <CalendarIcon />
                  </button>
                  <button
                    onClick={handleRunPrioritization}
                    disabled={priorityLoading || tasks.length === 0}
                    className="h-10 w-10 inline-flex items-center justify-center bg-slate-800 hover:bg-slate-900 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Prioritize tasks"
                    aria-label="Prioritize tasks"
                  >
                    {priorityLoading ? (
                      <SpinnerIcon />
                    ) : (
                      <SparkIcon />
                    )}
                  </button>
                  <button
                    onClick={openOpportunityModal}
                    disabled={opportunityLoading}
                    className="h-10 w-10 inline-flex items-center justify-center bg-amber-400 hover:bg-amber-500 text-slate-900 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Suggest move-the-needle actions"
                    aria-label="Suggest move-the-needle actions"
                  >
                    <LightbulbIcon />
                  </button>
                  <button
                    onClick={openDeferNonTop10Modal}
                    disabled={sortedTasks.length <= 10}
                    className="h-10 w-10 inline-flex items-center justify-center bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Move non-Top-10 tasks to tomorrow"
                    aria-label="Move non-Top-10 tasks to tomorrow"
                  >
                    <CalendarArrowIcon />
                  </button>
                  <button
                    onClick={() => {
                      setEditingTask(null);
                      setShowTaskModal(true);
                    }}
                    className="h-10 w-10 inline-flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                    title="Add task"
                    aria-label="Add task"
                  >
                    <PlusIcon />
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {!selectionMode && (
          <div className="mb-6 border-b border-slate-200">
            <div className="flex flex-wrap gap-6">
              <button
                type="button"
                onClick={() => setActiveTab('tasks')}
                className={`relative px-2 pb-3 font-medium transition-colors ${
                  activeTab === 'tasks'
                    ? 'text-blue-600'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                Tasks
                {activeTab === 'tasks' && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />
                )}
              </button>
              {showTaskTrends && (
                <button
                  type="button"
                  onClick={() => setActiveTab('trends')}
                  className={`relative px-2 pb-3 font-medium transition-colors ${
                    activeTab === 'trends'
                      ? 'text-blue-600'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  Trends
                  {activeTab === 'trends' && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />
                  )}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Filters Section */}
        {!selectionMode && activeTab === 'tasks' && (
          <FilterSection
            filtersCollapsed={filtersCollapsed}
            setFiltersCollapsed={setFiltersCollapsed}
            filterType={filterType}
            setFilterType={setFilterType}
            selectedProject={selectedProject}
            setSelectedProject={setSelectedProject}
            selectedDelegate={selectedDelegate}
            setSelectedDelegate={setSelectedDelegate}
            selectedGoal={selectedGoal}
            setSelectedGoal={setSelectedGoal}
            selectedMtnTags={selectedMtnTags}
            mtnTagOptions={MTN_TAG_OPTIONS}
            toggleMtnTagFilter={toggleMtnTagFilter}
            projects={projects}
            delegates={delegates}
            goals={goals}
            hasActiveFilters={hasActiveFilters}
            clearFilters={clearFilters}
          />
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg mb-4">
            {error}
          </div>
        )}

        {showTaskTrends && activeTab === 'trends' && (
          <TrendsErrorBoundary>
            <TaskMtnTrendsTab
              trends={mtnTrends}
              loading={mtnTrendsLoading}
              error={mtnTrendsError}
            />
          </TrendsErrorBoundary>
        )}

        {/* Tasks List */}
        {activeTab === 'tasks' && sortedTasks.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-slate-600 text-lg">{t('tasks.empty')}</p>
            <p className="text-slate-500 text-sm mt-2">
              {hasActiveFilters ? t('tasks.emptyFiltered') : t('tasks.emptyNew')}
            </p>
          </div>
        ) : activeTab === 'tasks' ? (
          <DragDropContext onDragEnd={handleDragEnd}>
            <Droppable droppableId="tasks">
              {(provided) => (
                <div
                  {...provided.droppableProps}
                  ref={provided.innerRef}
                  className="space-y-1"
                >
                  {sortedTasks.map((task, index) => {
                    const scoreData = getVisibleTaskScore(task);

                    return (
                      <TaskItem
                        key={task.id}
                        task={task}
                        index={index}
                        isCompleting={completingTasks.includes(task.id)}
                        isSelected={selectedTasks.includes(task.id)}
                        selectionMode={selectionMode}
                        onToggle={() => toggleTaskComplete(task.id)}
                        onStartEdit={() => {
                          setEditingTask(task);
                          setShowTaskModal(true);
                        }}
                        onLongPress={() => enterSelectionMode(task.id)}
                        onSelectToggle={() => toggleTaskSelection(task.id)}
                        onFollowUp={() => openFollowUpModal(task)}
                        goals={goals}
                        priorityMode={priorityMode || Boolean(scoreData)}
                        priorityScore={scoreData}
                        onMtnFeedback={(rating, feedback, tag, recommendationId) => handleMtnFeedback(task.id, rating, feedback, tag, recommendationId)}
                        timezone={timezone}
                      />
                    );
                  })}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>
        ) : null}
      </div>

      {/* Floating Action Bar */}
      {selectionMode && selectedTasks.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t-2 border-blue-500 shadow-2xl z-50">
          <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <span className="text-slate-700 font-medium">
                {selectedTasks.length} selected
              </span>
              <button
                onClick={exitSelectionMode}
                className="text-slate-600 hover:text-slate-800 text-sm"
              >
                Cancel
              </button>
            </div>
            <button
              onClick={() => setShowBulkActionModal(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium transition-colors"
            >
              Edit Selected
            </button>
          </div>
        </div>
      )}

      {/* Task Modal */}
      {showTaskModal && (
        <TaskModal
          task={editingTask}
          onSave={editingTask ? (updates) => updateTask(editingTask.id, updates) : addTask}
          onCancel={() => {
            setShowTaskModal(false);
            setEditingTask(null);
          }}
          onDelete={editingTask ? () => {
            deleteTask(editingTask.id);
            setShowTaskModal(false);
            setEditingTask(null);
          } : null}
          delegates={delegates}
          goals={getLongTermGoals(goals)}
          timezone={timezone}
        />
      )}

      {/* Bulk Action Modal */}
      {showBulkActionModal && (
        <BulkActionModal
          selectedCount={selectedTasks.length}
          onApply={applyBulkAction}
          onCancel={() => setShowBulkActionModal(false)}
          delegates={delegates}
          goals={getLongTermGoals(goals)}
          timezone={timezone}
        />
      )}

      {showFollowUpModal && selectedFollowUpTask && (
        <FollowUpModal
          task={selectedFollowUpTask}
          followUpDate={followUpDate}
          setFollowUpDate={setFollowUpDate}
          error={followUpError}
          saving={followUpSaving}
          onCancel={closeFollowUpModal}
          onConfirm={createFollowUp}
        />
      )}

      {showDeferModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/40 flex items-center justify-center px-4 py-6">
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-md overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200">
              <h2 className="text-lg font-semibold text-slate-900">Move all tasks outside today's Top 10 to tomorrow?</h2>
              <p className="text-sm text-slate-600 mt-2">
                The current first 10 visible tasks will stay as-is. The remaining {Math.max(sortedTasks.length - 10, 0)} task(s) will move to tomorrow.
              </p>
            </div>
            <div className="px-5 py-4 flex items-center justify-end gap-2 bg-slate-50">
              <button
                onClick={() => setShowDeferModal(false)}
                disabled={deferLoading}
                className="px-4 py-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-lg font-medium transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={deferNonTop10Tasks}
                disabled={deferLoading}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deferLoading ? 'Moving...' : 'Move to Tomorrow'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showOpportunityModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/40 flex items-center justify-center px-4 py-6">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">Move-the-needle actions</h2>
                <p className="text-sm text-slate-600 mt-1">
                  {opportunityLoading
                    ? "Alfred is looking for today's highest-leverage moves..."
                    : "Choose what belongs on today's list."}
                </p>
              </div>
              <button
                onClick={closeOpportunityModal}
                className="text-slate-500 hover:text-slate-800 p-2 rounded-lg hover:bg-slate-100"
                aria-label="Close recommendations"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
            </div>

            <div className="p-6 overflow-y-auto max-h-[calc(90vh-88px)]">
              {opportunityError && (
                <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg mb-4">
                  {opportunityError}
                </div>
              )}

              {opportunityLoading ? (
                <div className="py-12 flex flex-col items-center justify-center text-center">
                  <div className="animate-spin rounded-full h-9 w-9 border-b-2 border-amber-500 mb-4"></div>
                  <p className="text-slate-700 font-medium">Alfred is looking for today's highest-leverage moves...</p>
                </div>
              ) : opportunities.length === 0 && !opportunityError ? (
                <div className="text-center py-10 text-slate-600">
                  No recommendations came back this time.
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  {opportunities.map(opportunity => {
                    const action = opportunityActions[opportunity.id];
                    const goalTitle = opportunity.linked_goal_id
                      ? goals.find(goal => goal.id === opportunity.linked_goal_id)?.title
                      : null;

                    return (
                      <div key={opportunity.id} className="border border-slate-200 rounded-lg p-4 flex flex-col min-h-[260px]">
                        <div className="flex items-start justify-between gap-3 mb-3">
                          <h3 className="font-semibold text-slate-900 leading-snug">{opportunity.title}</h3>
                          <span className="shrink-0 bg-slate-900 text-white text-sm font-semibold px-2 py-1 rounded-md">
                            {Number(opportunity.mtn_score || 0).toFixed(1)}
                          </span>
                        </div>

                        {opportunity.description && (
                          <p className="text-sm text-slate-700 mb-3">{opportunity.description}</p>
                        )}

                        {opportunity.rationale && (
                          <p className="text-sm text-slate-600 mb-4">{opportunity.rationale}</p>
                        )}

                        <div className="flex flex-wrap gap-2 mt-auto mb-4">
                          {opportunity.domain && (
                            <span className="text-xs bg-amber-50 text-amber-800 border border-amber-200 px-2 py-1 rounded-md">
                              {opportunity.domain}
                            </span>
                          )}
                          {goalTitle && (
                            <span className="text-xs bg-blue-50 text-blue-800 border border-blue-200 px-2 py-1 rounded-md">
                              {goalTitle}
                            </span>
                          )}
                        </div>

                        {action === 'accepted' ? (
                          <div className="bg-green-50 text-green-800 text-sm font-medium rounded-lg px-3 py-2 text-center">
                            Added to today
                          </div>
                        ) : action === 'declined' ? (
                          <div className="bg-slate-100 text-slate-700 text-sm font-medium rounded-lg px-3 py-2 text-center">
                            Declined
                          </div>
                        ) : (
                          <div className="flex gap-2">
                            <button
                              onClick={() => acceptOpportunity(opportunity.id)}
                              disabled={action === 'working'}
                              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
                            >
                              Add to today
                            </button>
                            <button
                              onClick={() => declineOpportunity(opportunity.id)}
                              disabled={action === 'working'}
                              className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
                            >
                              Decline
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showMtnBreakdown && (
        <MtnBreakdownModal
          score={todayMtnScore}
          tasks={todayMtnTasks}
          date={todayKey}
          timezone={timezone}
          onClose={() => setShowMtnBreakdown(false)}
        />
      )}
    </div>
  );
}

function DailyMtnNeedle({ score, completedTasks, benchmark, onClick }) {
  const scaleMax = Math.max(Number(benchmark?.effectiveMax || 20), 1);
  const cappedScore = Math.max(0, Math.min(Number(score || 0), scaleMax));
  const needleLeft = 7 + (cappedScore / scaleMax) * 86;
  const comparison = benchmark?.isDynamic
    ? describeMtnAverageComparison(score, benchmark.avgMtn)
    : 'Building your 30-day benchmark';
  const label = completedTasks > 0
    ? `${formatMtnNumber(score)} MTN from ${completedTasks} done`
    : `${formatMtnNumber(score)} MTN today`;
  const title = benchmark?.isDynamic
    ? `Today's MTN: ${formatMtnNumber(score)}\n${comparison}`
    : `${label}\nStatic scale until 7 active MTN days`;
  const segments = benchmark?.segments?.length ? benchmark.segments : STATIC_MTN_SEGMENTS;

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-96 max-w-[82vw] rounded-md px-1 py-1 text-left transition-colors hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
      title={title}
      aria-label={title}
    >
      <div className="relative h-8">
        <div className="absolute inset-x-0 top-3 flex h-3 overflow-hidden rounded-full border border-slate-200 bg-slate-100">
          {segments.map(segment => (
            <span
              key={segment.label}
              style={{
                backgroundColor: segment.color,
                flexGrow: segment.range,
                flexBasis: 0,
              }}
            />
          ))}
        </div>
        <div
          className="absolute top-0 h-8 w-1 rounded-full bg-slate-900 shadow-sm transition-all"
          style={{ left: `${needleLeft}%` }}
        >
          <span className="absolute -left-[5px] -top-1 h-0 w-0 border-l-[7px] border-r-[7px] border-t-[8px] border-l-transparent border-r-transparent border-t-slate-900" />
        </div>
      </div>
    </button>
  );
}

function formatDateTimeForDisplay(value, timezone) {
  if (!value) return '';
  return new Date(value).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: timezone
  });
}

function MtnBreakdownModal({ score, tasks, date, timezone, onClose }) {
  return (
    <div className="fixed inset-0 z-50 bg-slate-950/40 flex items-center justify-center px-4 py-6">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-2xl max-h-[88vh] overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Today's MTN breakdown</h2>
            <p className="text-sm text-slate-500 mt-1">
              {formatMtnNumber(score)} MTN on {date} from {tasks.length} completed task(s)
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-800 p-2 rounded-lg hover:bg-slate-100"
            aria-label="Close MTN breakdown"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="p-5 overflow-y-auto max-h-[calc(88vh-92px)]">
          {tasks.length === 0 ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">
              No completed tasks have contributed to today's MTN score yet.
            </div>
          ) : (
            <div className="space-y-2">
              {tasks.map(task => (
                <div key={task.id} className="flex items-start justify-between gap-4 rounded-lg border border-slate-200 bg-white px-4 py-3">
                  <div className="min-w-0">
                    <div className="font-medium text-slate-900">{task.title}</div>
                    {task.completed_at && (
                      <div className="mt-1 text-xs text-slate-400">
                        Completed {formatDateTimeForDisplay(task.completed_at, timezone)}
                      </div>
                    )}
                  </div>
                  <div className="shrink-0 rounded-md bg-blue-50 px-2.5 py-1 text-sm font-semibold text-blue-700">
                    {formatMtnNumber(task.mtn_score)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const MTN_CHART_WIDTH = 720;
const MTN_CHART_HEIGHT = 240;
const MTN_CHART_PADDING = 34;
const MTN_CHART_BOTTOM_PADDING = 46;

const extractTrendChart = (payload) => {
  if (Array.isArray(payload)) return payload;
  const candidates = [
    payload?.trend_chart,
    payload?.trendChart,
    payload?.data?.trend_chart,
    payload?.data?.trendChart,
    payload?.trends?.trend_chart,
    payload?.trends?.trendChart,
  ];
  return candidates.find(Array.isArray) || [];
};

const dateKey = (dateString) => {
  const match = String(dateString || '').match(/\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : '';
};

const dateToTime = (dateString) => {
  const [year, month, day] = dateKey(dateString).split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day).getTime();
};

function formatShortDate(dateString) {
  if (!dateString) return '';
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric'
  });
}

function formatMtnNumber(value) {
  const numeric = Number(value || 0);
  return numeric.toFixed(1);
}

const MTN_BRACKET_COLORS = {
  Low: '#DC2626',
  Base: '#F97316',
  Good: '#FACC15',
  Strong: '#84CC16',
  Peak: '#16A34A',
};

const STATIC_MTN_SEGMENTS = [
  { label: 'Low', start: 0, end: 4, range: 4, color: MTN_BRACKET_COLORS.Low },
  { label: 'Base', start: 4, end: 8, range: 4, color: MTN_BRACKET_COLORS.Base },
  { label: 'Good', start: 8, end: 12, range: 4, color: MTN_BRACKET_COLORS.Good },
  { label: 'Strong', start: 12, end: 16, range: 4, color: MTN_BRACKET_COLORS.Strong },
  { label: 'Peak', start: 16, end: 20, range: 4, color: MTN_BRACKET_COLORS.Peak },
];

const buildDailyMtnBenchmark = (mtnTrends) => {
  const todayDate = mtnTrends?.summary?.today?.date;
  const rows = extractTrendChart(mtnTrends)
    .map(row => ({
      date: dateKey(row.date),
      mtnScore: Number(row.mtn_score ?? row.mtnScore ?? 0),
      completedTasks: Number(row.completed_tasks ?? row.completedTasks ?? 0),
    }))
    .filter(row => row.date);

  const previousRows = todayDate
    ? rows.filter(row => row.date < todayDate)
    : rows.slice(0, -1);
  const historyRows = previousRows.slice(-30);
  const activeHistoryDays = historyRows.filter(row => row.completedTasks > 0 || row.mtnScore > 0).length;

  if (activeHistoryDays < 7) {
    return {
      isDynamic: false,
      avgMtn: 0,
      effectiveMax: 20,
      activeHistoryDays,
      segments: STATIC_MTN_SEGMENTS,
    };
  }

  const dailyScores = historyRows.map(row => row.mtnScore);
  const avgMtn = dailyScores.reduce((sum, value) => sum + value, 0) / Math.max(dailyScores.length, 1);
  const maxMtn = Math.max(...dailyScores, 0);
  const effectiveMax = Math.max(maxMtn, avgMtn + 5, 1);
  const range = effectiveMax - avgMtn;
  const boundaries = [
    0,
    avgMtn * 0.5,
    avgMtn,
    avgMtn + range * 0.33,
    avgMtn + range * 0.66,
    effectiveMax,
  ];
  const labels = ['Low', 'Base', 'Good', 'Strong', 'Peak'];
  const segments = labels.map((label, index) => {
    const start = boundaries[index];
    const end = Math.max(boundaries[index + 1], start);
    return {
      label,
      start,
      end,
      range: Math.max(end - start, 0.1),
      color: MTN_BRACKET_COLORS[label],
    };
  });

  return {
    isDynamic: true,
    avgMtn,
    maxMtn,
    effectiveMax,
    activeHistoryDays,
    segments,
  };
};

const describeMtnAverageComparison = (score, average) => {
  const numericScore = Number(score || 0);
  const numericAverage = Number(average || 0);
  if (numericAverage <= 0) return 'Your 30-day average is still forming';

  const percent = Math.round(((numericScore - numericAverage) / numericAverage) * 100);
  if (percent > 0) return `${percent}% above your 30-day average`;
  if (percent < 0) return `${Math.abs(percent)}% below your 30-day average`;
  return 'Right at your 30-day average';
};

const dateFromKey = (key) => {
  const [year, month, day] = dateKey(key).split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
};

const addDays = (date, days) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const formatDateKey = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const fillMtnTrendDates = (rows) => {
  const sortedRows = [...rows].sort((a, b) => dateToTime(a.date) - dateToTime(b.date));
  const firstDate = dateFromKey(sortedRows[0]?.date);
  const lastDate = dateFromKey(sortedRows[sortedRows.length - 1]?.date);
  if (!firstDate || !lastDate) return sortedRows;

  const rowsByDate = new Map(sortedRows.map(row => [row.date, row]));
  const filled = [];

  for (let cursor = firstDate; cursor <= lastDate; cursor = addDays(cursor, 1)) {
    const currentKey = formatDateKey(cursor);
    filled.push(rowsByDate.get(currentKey) || {
      date: currentKey,
      mtnScore: 0,
      rollingAverage: 0,
      completedTasks: 0,
    });
  }

  return filled.map((row, index) => {
    const rollingValues = filled.slice(Math.max(0, index - 6), index + 1).map(item => Number(item.mtnScore || 0));
    const rollingAverage = rollingValues.reduce((sum, value) => sum + value, 0) / Math.max(rollingValues.length, 1);
    return {
      ...row,
      rollingAverage,
    };
  });
};

const buildMtnDateTicks = (points) => {
  if (!points.length) return [];
  const tickCount = Math.min(6, points.length);
  const used = new Set();

  return Array.from({ length: tickCount })
    .map((_, index) => Math.round((index / Math.max(tickCount - 1, 1)) * (points.length - 1)))
    .filter((pointIndex) => {
      if (used.has(pointIndex)) return false;
      used.add(pointIndex);
      return true;
    })
    .map((pointIndex) => ({
      index: pointIndex,
      date: points[pointIndex]?.date,
      x: MTN_CHART_PADDING + (pointIndex / Math.max(points.length - 1, 1)) * (MTN_CHART_WIDTH - MTN_CHART_PADDING * 2),
    }));
};

const buildMtnTrendPath = (points, key, maxValue) => {
  if (!points.length || !maxValue) return '';
  return points
    .map((point, index) => {
      const x = MTN_CHART_PADDING + (index / Math.max(points.length - 1, 1)) * (MTN_CHART_WIDTH - MTN_CHART_PADDING * 2);
      const value = Math.max(0, Math.min(Number(point[key]) || 0, maxValue));
      const y = MTN_CHART_HEIGHT - MTN_CHART_BOTTOM_PADDING - (value / maxValue) * (MTN_CHART_HEIGHT - MTN_CHART_PADDING - MTN_CHART_BOTTOM_PADDING);
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');
};

function StatTile({ label, value, detail }) {
  return (
    <div className="rounded-lg border bg-white p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-slate-900">{value}</div>
      {detail && <div className="mt-1 text-sm text-slate-500">{detail}</div>}
    </div>
  );
}

class TrendsErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error) {
    console.error('Task trends render failed:', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
          Task trends could not render with the current chart data. The task list is still available.
          <button
            type="button"
            onClick={() => this.setState({ hasError: false })}
            className="ml-3 rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100"
          >
            Retry
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

function TaskMtnTrendChart({ data }) {
  const [rangeDays, setRangeDays] = useState(21);
  const rows = (Array.isArray(data) ? data : [])
    .filter(item => item && typeof item === 'object' && dateKey(item.date))
    .map(item => ({
      date: dateKey(item.date),
      mtnScore: Number(item.mtn_score || 0),
      rollingAverage: Number(item.rolling_average || 0),
      completedTasks: Number(item.completed_tasks || 0),
    }));
  const visibleRows = fillMtnTrendDates(rows).slice(-rangeDays);
  const maxValue = Math.max(
    1,
    Math.ceil(Math.max(...visibleRows.flatMap(item => [item.mtnScore, item.rollingAverage]), 0) * 1.15)
  );
  const dateTicks = buildMtnDateTicks(visibleRows);
  const dailyPath = buildMtnTrendPath(visibleRows, 'mtnScore', maxValue);
  const averagePath = buildMtnTrendPath(visibleRows, 'rollingAverage', maxValue);
  const yAxisValues = [0, maxValue / 4, maxValue / 2, (maxValue * 3) / 4, maxValue];
  const baselineY = MTN_CHART_HEIGHT - MTN_CHART_BOTTOM_PADDING;

  return (
    <div className="rounded-lg border bg-white p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">MTN Score Trend</h2>
          <p className="mt-1 text-sm text-slate-500">Last {rangeDays} days of task momentum.</p>
          <div className="mt-2 flex flex-wrap gap-4 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-slate-300" /> Daily MTN</span>
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue-600" /> 7-day average</span>
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-slate-500" /> No input</span>
          </div>
        </div>
        <TrendRangeToggle value={rangeDays} onChange={setRangeDays} label="Task trend range" />
      </div>

      {visibleRows.length === 0 ? (
        <div className="mt-4 rounded border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
          No MTN trend data is available yet.
        </div>
      ) : (
        <div className="mt-4 overflow-hidden rounded-md bg-slate-50">
          <svg viewBox={`0 0 ${MTN_CHART_WIDTH} ${MTN_CHART_HEIGHT}`} className="h-72 w-full">
            {yAxisValues.map(value => {
              const y = MTN_CHART_HEIGHT - MTN_CHART_BOTTOM_PADDING - (value / maxValue) * (MTN_CHART_HEIGHT - MTN_CHART_PADDING - MTN_CHART_BOTTOM_PADDING);
              return (
                <g key={value}>
                  <line x1={MTN_CHART_PADDING} x2={MTN_CHART_WIDTH - MTN_CHART_PADDING} y1={y} y2={y} stroke="#e2e8f0" />
                  <text x={6} y={y + 4} className="fill-slate-400 text-[10px]">{formatMtnNumber(value)}</text>
                </g>
              );
            })}
            <line x1={MTN_CHART_PADDING} x2={MTN_CHART_WIDTH - MTN_CHART_PADDING} y1={baselineY} y2={baselineY} stroke="#cbd5e1" />
            {dateTicks.map((tick) => (
              <g key={`${tick.index}-${tick.date}`}>
                <line x1={tick.x} x2={tick.x} y1={baselineY} y2={baselineY + 4} stroke="#94a3b8" />
                <text x={tick.x} y={MTN_CHART_HEIGHT - 12} textAnchor="middle" className="fill-slate-400 text-[10px]">
                  {formatShortDate(tick.date)}
                </text>
              </g>
            ))}
            <path d={dailyPath} fill="none" stroke="#cbd5e1" strokeWidth="2" />
            <path d={averagePath} fill="none" stroke="#2563eb" strokeWidth="3" strokeLinecap="round" />
            {visibleRows.map((point, index) => {
              if (point.completedTasks > 0 || point.mtnScore > 0) return null;
              const x = MTN_CHART_PADDING + (index / Math.max(visibleRows.length - 1, 1)) * (MTN_CHART_WIDTH - MTN_CHART_PADDING * 2);
              return (
                <circle key={`no-input-${point.date}`} cx={x} cy={baselineY} r="2.4" fill="#64748b">
                  <title>{`${formatShortDate(point.date)}: 0.0 MTN, no input`}</title>
                </circle>
              );
            })}
            {visibleRows.map((point, index) => {
              if (point.mtnScore <= 0) return null;
              const x = MTN_CHART_PADDING + (index / Math.max(visibleRows.length - 1, 1)) * (MTN_CHART_WIDTH - MTN_CHART_PADDING * 2);
              const y = MTN_CHART_HEIGHT - MTN_CHART_BOTTOM_PADDING - (Math.min(point.mtnScore, maxValue) / maxValue) * (MTN_CHART_HEIGHT - MTN_CHART_PADDING - MTN_CHART_BOTTOM_PADDING);
              return (
                <circle key={`mtn-${point.date}`} cx={x} cy={y} r="2.3" fill="#2563eb">
                  <title>{`${formatShortDate(point.date)}: ${formatMtnNumber(point.mtnScore)} MTN from ${point.completedTasks} task(s). 7-day average ${formatMtnNumber(point.rollingAverage)}`}</title>
                </circle>
              );
            })}
          </svg>
        </div>
      )}
    </div>
  );
}

const weekdayIndexFromDate = (dateString) => {
  const [year, month, day] = dateString.split('-').map(Number);
  const jsDay = new Date(year, month - 1, day).getDay();
  return (jsDay + 6) % 7;
};

const colorForMtnScore = (score, completedTasks) => {
  if (!completedTasks) return 'bg-slate-100';
  if (score >= 20) return 'bg-emerald-700';
  if (score >= 15) return 'bg-emerald-500';
  if (score >= 10) return 'bg-amber-300';
  if (score >= 5) return 'bg-rose-300';
  return 'bg-rose-600';
};

function TaskMtnHeatmap({ data }) {
  const days = Array.isArray(data) ? data : [];
  const weeks = [];

  days.forEach((day, index) => {
    const weekday = weekdayIndexFromDate(day.date);
    if (index === 0 || weekday === 0) {
      weeks.push([]);
    }
    weeks[weeks.length - 1].push({ ...day, weekday });
  });

  return (
    <div className="rounded-lg border bg-white p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-800">MTN Heatmap</h2>
        <span className="text-xs text-slate-500">Last 90 days</span>
      </div>

      <div className="mt-4 overflow-x-auto pb-1">
        <div className="min-w-[360px] space-y-1">
          <div className="grid grid-cols-7 gap-1 pl-14 text-center text-[11px] text-slate-400">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(label => (
              <div key={label}>{label}</div>
            ))}
          </div>
          {weeks.map((week, weekIndex) => (
            <div key={weekIndex} className="grid grid-cols-[48px_repeat(7,1fr)] items-center gap-1">
              <div className="text-right text-[11px] text-slate-400">Week {weekIndex + 1}</div>
              {Array.from({ length: 7 }).map((_, weekday) => {
                const day = week.find(item => item.weekday === weekday);
                return day ? (
                  <div
                    key={day.date}
                    title={`${formatShortDate(day.date)}: ${formatMtnNumber(day.mtn_score)} MTN from ${day.completed_tasks || 0} completed task(s)`}
                    className={`h-4 min-w-4 rounded-sm ${colorForMtnScore(Number(day.mtn_score || 0), Number(day.completed_tasks || 0))}`}
                  />
                ) : (
                  <div key={`${weekIndex}-${weekday}`} className="h-4 min-w-4" />
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-end gap-2 text-xs text-slate-500">
        <span>No entry</span>
        <span className="h-3 w-3 rounded-sm bg-slate-100" />
        <span>Low</span>
        <span className="h-3 w-3 rounded-sm bg-rose-600" />
        <span className="h-3 w-3 rounded-sm bg-rose-300" />
        <span className="h-3 w-3 rounded-sm bg-amber-300" />
        <span className="h-3 w-3 rounded-sm bg-emerald-500" />
        <span className="h-3 w-3 rounded-sm bg-emerald-700" />
        <span>High</span>
      </div>
    </div>
  );
}

function TaskMtnTrendsTab({ trends, loading, error }) {
  if (loading) {
    return (
      <div className="rounded-lg border bg-white p-6 text-sm text-slate-500">
        Loading MTN trends...
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700">
        {error}
      </div>
    );
  }

  const summary = trends?.summary || {};
  const today = summary.today || {};
  const last7 = summary.last_7_days || {};
  const last30 = summary.last_30_days || {};
  const last90 = summary.last_90_days || {};
  const delta = Number(last7.trend?.delta_vs_30 || 0);
  const sign = delta > 0 ? '+' : '';

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <StatTile
          label="Today"
          value={formatMtnNumber(today.mtn_score)}
          detail={`${today.completed_tasks || 0} completed task(s)`}
        />
        <StatTile
          label="Last 7 Days"
          value={formatMtnNumber(last7.total_score)}
          detail={`Avg ${formatMtnNumber(last7.average_score)} per day`}
        />
        <StatTile
          label="Last 30 Days"
          value={formatMtnNumber(last30.total_score)}
          detail={`${last30.active_days || 0} active day(s)`}
        />
        <StatTile
          label="Momentum"
          value={last7.trend?.label || 'Stable'}
          detail={`${sign}${formatMtnNumber(delta)} vs 30-day avg`}
        />
      </div>

      <TaskMtnTrendChart data={extractTrendChart(trends)} />
      <TaskMtnHeatmap data={extractTrendChart(trends)} />

      <div className="rounded-lg border bg-white p-4">
        <h2 className="text-lg font-semibold text-slate-800">90-Day Total</h2>
        <div className="mt-2 text-3xl font-semibold text-slate-900">
          {formatMtnNumber(last90.total_score)}
        </div>
        <p className="mt-1 text-sm text-slate-500">
          {last90.completed_tasks || 0} completed task(s) contributed to this score.
        </p>
      </div>

      <ProcrastinationRanking tasks={summary.procrastination_ranking || []} />
    </div>
  );
}

function ProcrastinationRanking({ tasks }) {
  const rankedTasks = Array.isArray(tasks) ? tasks : [];

  return (
    <div className="rounded-lg border bg-white p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">Procrastination Ranking</h2>
          <p className="mt-1 text-sm text-slate-500">
            Tasks most often moved to a later due date.
          </p>
        </div>
        <div className="rounded bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">
          Top {Math.min(rankedTasks.length, 3)}
        </div>
      </div>

      {rankedTasks.length === 0 ? (
        <div className="mt-4 rounded border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
          No postponed tasks recorded yet.
        </div>
      ) : (
        <div className="mt-4 divide-y divide-slate-100">
          {rankedTasks.map((task, index) => (
            <div key={task.id} className="grid grid-cols-[2rem_1fr_auto] items-center gap-3 py-3">
              <div className="text-sm font-semibold text-slate-400">#{index + 1}</div>
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-slate-800">{task.title}</div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  {task.project && <span>{task.project}</span>}
                  {task.due_date && <span>Due {formatShortDate(dateKey(task.due_date))}</span>}
                  {task.mtn_score !== undefined && <span>MTN {formatMtnNumber(task.mtn_score)}</span>}
                  {task.status && <span className="capitalize">{task.status}</span>}
                </div>
              </div>
              <div className="rounded bg-amber-50 px-2 py-1 text-sm font-semibold text-amber-700">
                {task.times_postponed}x
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FollowUpModal({
  task,
  followUpDate,
  setFollowUpDate,
  error,
  saving,
  onCancel,
  onConfirm
}) {
  return (
    <div className="fixed inset-0 z-50 bg-slate-950/40 flex items-center justify-center px-4 py-6">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-md overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Create Follow-Up</h2>
            <p className="text-sm text-slate-500 mt-1">Done for now. Remind me later.</p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="text-slate-500 hover:text-slate-800 p-1 rounded hover:bg-slate-100 disabled:opacity-50"
            aria-label="Close follow-up"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div>
            <p className="text-sm font-medium text-slate-700">Follow up on:</p>
            <p className="mt-1 text-base font-semibold text-slate-900 break-words">{task.title}</p>
          </div>

          <div>
            <label htmlFor="follow-up-date" className="block text-sm font-medium text-slate-700 mb-1">
              Follow-up date
            </label>
            <input
              id="follow-up-date"
              type="date"
              value={followUpDate}
              onChange={(event) => setFollowUpDate(event.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-base"
              autoFocus
            />
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </div>
          )}
        </div>

        <div className="px-5 py-4 flex items-center justify-end gap-2 bg-slate-50">
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="px-4 py-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-lg font-medium transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={saving}
            className="px-5 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Creating...' : 'OK'}
          </button>
        </div>
      </div>
    </div>
  );
}

function IconSvg({ children, className = '' }) {
  return (
    <svg className={`h-4 w-4 ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

function ResetIcon() {
  return (
    <IconSvg>
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v6h6" />
    </IconSvg>
  );
}

function CalendarIcon() {
  return (
    <IconSvg>
      <path d="M8 2v4" />
      <path d="M16 2v4" />
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M3 10h18" />
    </IconSvg>
  );
}

function SparkIcon() {
  return (
    <IconSvg>
      <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />
    </IconSvg>
  );
}

function LightbulbIcon() {
  return (
    <IconSvg>
      <path d="M9 18h6" />
      <path d="M10 22h4" />
      <path d="M12 2a7 7 0 0 0-4 12.74V16h8v-1.26A7 7 0 0 0 12 2Z" />
    </IconSvg>
  );
}

function CalendarArrowIcon() {
  return (
    <IconSvg>
      <path d="M8 2v4" />
      <path d="M16 2v4" />
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M3 10h18" />
      <path d="M8 15h7" />
      <path d="m12 12 3 3-3 3" />
    </IconSvg>
  );
}

function PlusIcon() {
  return (
    <IconSvg>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </IconSvg>
  );
}

function CloseIcon() {
  return (
    <IconSvg>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </IconSvg>
  );
}

function SpinnerIcon() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4Z" />
    </svg>
  );
}
