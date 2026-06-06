// frontend/src/components/TodoList.jsx
import { useState, useEffect } from 'react';
import { DragDropContext, Droppable } from 'react-beautiful-dnd';
import axios from 'axios';
import TaskItem from './TodoList/TaskItem';
import TaskModal from './TodoList/TaskModal';
import BulkActionModal from './TodoList/BulkActionModal';
import FilterSection from './TodoList/FilterSection';
import { getTodayET, getETDate, formatDateForInput, isOverdueET, getSortedGoals } from '../utils/taskHelpers';
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
  // Task data
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Filters
  const [filterType, setFilterType] = useState('due_today');
  const [selectedProject, setSelectedProject] = useState('');
  const [selectedDelegate, setSelectedDelegate] = useState('');
  const [selectedGoal, setSelectedGoal] = useState('');
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
  const [activeTab, setActiveTab] = useState('tasks');
  const [mtnTrends, setMtnTrends] = useState(null);
  const [mtnTrendsLoading, setMtnTrendsLoading] = useState(false);
  const [mtnTrendsError, setMtnTrendsError] = useState(null);
  const [mtnOverlayTrends, setMtnOverlayTrends] = useState({ habits: [], journal: [] });
  const [mtnOverlayErrors, setMtnOverlayErrors] = useState({});
  const [showMtnBreakdown, setShowMtnBreakdown] = useState(false);
  const [todayKey, setTodayKey] = useState(getTodayET(timezone));

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

  const fetchTasks = async () => {
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
      setTasks(taskList.filter(task => String(task.status || '').toLowerCase() !== 'completed'));
    } catch (err) {
      console.error('Error fetching tasks:', err);
      setError(err.response?.data?.detail || 'Failed to load tasks');
    } finally {
      setLoading(false);
    }
  };

  const fetchMtnTrends = async () => {
    if (apiUrl == null || !userNumber) return;
    setMtnTrendsLoading(true);
    setMtnTrendsError(null);
    try {
      const [tasksResponse, habitsResponse, journalResponse] = await Promise.allSettled([
        axios.get(`${apiUrl}/api/tasks/mtn-trends`, { params: { user_number: userNumber } }),
        axios.get(`${apiUrl}/api/habits/trends`, { params: { user_number: userNumber } }),
        axios.get(`${apiUrl}/api/journal/journal/trends`, { params: { user_number: userNumber } }),
      ]);

      if (tasksResponse.status === 'fulfilled') {
        setMtnTrends(tasksResponse.value.data);
      } else {
        throw tasksResponse.reason;
      }

      setMtnOverlayTrends({
        habits: habitsResponse.status === 'fulfilled' ? extractTrendChart(habitsResponse.value.data) : [],
        journal: journalResponse.status === 'fulfilled' ? extractTrendChart(journalResponse.value.data) : [],
      });
      setMtnOverlayErrors({
        habits: habitsResponse.status === 'rejected' ? 'request failed' : '',
        journal: journalResponse.status === 'rejected' ? 'request failed' : '',
        habitsShape: habitsResponse.status === 'fulfilled' ? responseShape(habitsResponse.value.data) : '',
        journalShape: journalResponse.status === 'fulfilled' ? responseShape(journalResponse.value.data) : '',
      });
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

  const hasStoredMtnScoring = () => {
    return tasks.some(task => Boolean(getVisibleTaskScore(task)));
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
    // Manual drag-and-drop order should always win once it exists. MTN scores
    // still render as labels, but they should not lock the list order.
    if (sortOrder.length > 0) {
      return [...tasks].sort((a, b) => {
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

    const persistedOrderValues = tasks
      .map(task => task.sort_order)
      .filter(order => order !== null && order !== undefined);
    const hasPersistedTaskOrder = new Set(persistedOrderValues).size > 1;
    if (hasPersistedTaskOrder) {
      return [...tasks].sort((a, b) => {
        const orderA = a.sort_order ?? 999999;
        const orderB = b.sort_order ?? 999999;
        if (orderA !== orderB) return orderA - orderB;
        return 0;
      });
    }

    if (hasStoredMtnScoring()) {
      return [...tasks].sort((a, b) => {
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
    return [...tasks].sort((a, b) => {
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

  const hasActiveFilters = selectedProject || selectedDelegate || selectedGoal || filterType !== 'due_today';
  const sortedTasks = getSortedTasks();
  const todayMtnScore = Number(mtnTrends?.summary?.today?.mtn_score || 0);
  const todayCompletedTasks = Number(mtnTrends?.summary?.today?.completed_tasks || 0);
  const todayMtnTasks = Array.isArray(mtnTrends?.summary?.today?.tasks)
    ? mtnTrends.summary.today.tasks
    : [];

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

        {activeTab === 'trends' && (
          <TaskMtnTrendsTab
            apiUrl={apiUrl}
            userNumber={userNumber}
            trends={mtnTrends}
            overlayTrends={mtnOverlayTrends}
            overlayErrors={mtnOverlayErrors}
            loading={mtnTrendsLoading}
            error={mtnTrendsError}
          />
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
          goals={getSortedGoals(goals)}
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
          goals={getSortedGoals(goals)}
          timezone={timezone}
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

function DailyMtnNeedle({ score, completedTasks, onClick }) {
  const cappedScore = Math.max(0, Math.min(Number(score || 0), 20));
  const needleLeft = 7 + (cappedScore / 20) * 86;
  const label = completedTasks > 0
    ? `${formatMtnNumber(score)} MTN from ${completedTasks} done`
    : `${formatMtnNumber(score)} MTN today`;

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-64 max-w-[68vw] rounded-md px-1 py-0.5 text-left transition-colors hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
      title={label}
      aria-label={label}
    >
      <div className="relative h-5">
        <div className="absolute inset-x-0 top-2 grid h-2 grid-cols-5 overflow-hidden rounded-full border border-slate-200 bg-slate-100">
          <span className="bg-blue-100" />
          <span className="bg-blue-200" />
          <span className="bg-blue-300" />
          <span className="bg-blue-500" />
          <span className="bg-blue-700" />
        </div>
        <div
          className="absolute top-0 h-5 w-0.5 rounded-full bg-slate-900 shadow-sm transition-all"
          style={{ left: `${needleLeft}%` }}
        >
          <span className="absolute -left-[5px] -top-1 h-0 w-0 border-l-[5px] border-r-[5px] border-t-[6px] border-l-transparent border-r-transparent border-t-slate-900" />
        </div>
      </div>
      <div className="flex justify-between text-[10px] text-slate-400">
        <span>0</span>
        <span>5</span>
        <span>10</span>
        <span>15</span>
        <span>20+</span>
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
const TREND_OVERLAY_DEFS = {
  habits: { label: 'Habits', color: '#16a34a', unit: '%', axisMax: 100 },
  tasks: { label: 'Tasks', color: '#f97316', unit: 'MTN' },
  journal: { label: 'Journal', color: '#7c3aed', unit: 'Depth', axisMax: 10 },
};

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

const responseShape = (payload) => {
  if (Array.isArray(payload)) return 'array';
  if (!payload || typeof payload !== 'object') return typeof payload;
  return Object.keys(payload).slice(0, 6).join(', ') || 'object';
};

const percentile = (values, ratio) => {
  const sorted = values
    .filter(value => Number.isFinite(value))
    .sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const index = Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * ratio));
  return sorted[index];
};

const buildMtnPath = (points, key, maxValue) => {
  if (!points.length) return '';
  return points
    .map((point, index) => {
      const x = MTN_CHART_PADDING + (index / Math.max(points.length - 1, 1)) * (MTN_CHART_WIDTH - MTN_CHART_PADDING * 2);
      const scaledValue = Math.min(Number(point[key]) || 0, maxValue);
      const y = MTN_CHART_HEIGHT - MTN_CHART_BOTTOM_PADDING - (scaledValue / maxValue) * (MTN_CHART_HEIGHT - MTN_CHART_PADDING - MTN_CHART_BOTTOM_PADDING);
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');
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

const buildMtnDatePath = (points, key, maxValue, startTime, endTime) => {
  if (!points.length || !maxValue || startTime === null || endTime === null) return '';
  const range = Math.max(endTime - startTime, 1);
  const plotted = points
    .map(point => {
      const pointTime = dateToTime(point.date);
      if (pointTime === null || pointTime < startTime || pointTime > endTime) return null;
      const x = MTN_CHART_PADDING + ((pointTime - startTime) / range) * (MTN_CHART_WIDTH - MTN_CHART_PADDING * 2);
      const scaledValue = Math.min(Number(point[key]) || 0, maxValue);
      const y = MTN_CHART_HEIGHT - MTN_CHART_BOTTOM_PADDING - (scaledValue / maxValue) * (MTN_CHART_HEIGHT - MTN_CHART_PADDING - MTN_CHART_BOTTOM_PADDING);
      return { x, y };
    })
    .filter(Boolean)
  return plotted
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
    .join(' ');
};

const buildMtnDateDots = (points, key, maxValue, startTime, endTime) => {
  if (!points.length || !maxValue || startTime === null || endTime === null) return [];
  const range = Math.max(endTime - startTime, 1);
  return points
    .map(point => {
      const pointTime = dateToTime(point.date);
      if (pointTime === null || pointTime < startTime || pointTime > endTime) return null;
      const x = MTN_CHART_PADDING + ((pointTime - startTime) / range) * (MTN_CHART_WIDTH - MTN_CHART_PADDING * 2);
      const scaledValue = Math.min(Number(point[key]) || 0, maxValue);
      const y = MTN_CHART_HEIGHT - MTN_CHART_BOTTOM_PADDING - (scaledValue / maxValue) * (MTN_CHART_HEIGHT - MTN_CHART_PADDING - MTN_CHART_BOTTOM_PADDING);
      return { ...point, x, y, value: Number(point[key]) || 0 };
    })
    .filter(point => point && point.value > 0);
};

const overlayStats = (points, startTime, endTime) => {
  const inRange = points.filter(point => {
    const pointTime = dateToTime(point.date);
    return pointTime !== null && startTime !== null && endTime !== null && pointTime >= startTime && pointTime <= endTime;
  });
  return {
    loaded: points.length,
    total: inRange.length,
    nonZero: inRange.filter(point => Number(point.overlay_score || 0) > 0).length,
    firstDate: points[0]?.date || null,
    lastDate: points[points.length - 1]?.date || null,
  };
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

function StatTile({ label, value, detail }) {
  return (
    <div className="rounded-lg border bg-white p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-slate-900">{value}</div>
      {detail && <div className="mt-1 text-sm text-slate-500">{detail}</div>}
    </div>
  );
}

const getTaskOverlayConfig = (overlayKey, overlays) => {
  if (!overlayKey) return null;
  const overlayData = overlays || {};
  const series = {
    habits: (overlayData.habits || []).map(point => ({ date: dateKey(point.date), overlay_score: Number(point.compliance_rate || 0) })),
    tasks: (overlayData.tasks || []).map(point => ({ date: dateKey(point.date), overlay_score: Number(point.mtn_score || 0) })),
    journal: (overlayData.journal || []).map(point => ({
      date: dateKey(point.date),
      overlay_score: Number(point.entry_count || 0) > 0 ? Number(point.daily_average || 0) : 0,
    })),
  };
  const points = (series[overlayKey] || [])
    .filter(point => point.date)
    .sort((a, b) => dateToTime(a.date) - dateToTime(b.date));
  const values = points.map(point => Number(point.overlay_score || 0));

  return {
    axisMax: TREND_OVERLAY_DEFS[overlayKey]?.axisMax || Math.max(1, Math.ceil(Math.max(...values, 0) * 1.2)),
    points,
  };
};

function TrendOverlayButtons({ selected, onSelect }) {
  return (
    <div className="flex flex-wrap justify-end gap-2">
      {Object.entries(TREND_OVERLAY_DEFS).map(([key, item]) => (
        <button
          key={key}
          type="button"
          onClick={() => onSelect(selected === key ? null : key)}
          className={`rounded-md border px-2.5 py-1 text-xs font-semibold transition-colors ${
            selected === key
              ? 'border-slate-700 bg-slate-900 text-white'
              : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
          }`}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

function TaskMtnTrendChart({ data, overlays, overlayErrors = {} }) {
  const points = Array.isArray(data) ? data : [];
  const [selectedOverlay, setSelectedOverlay] = useState(null);
  const values = points.flatMap(point => [
    Number(point.mtn_score || 0),
    Number(point.rolling_average || 0)
  ]);
  const positiveDailyValues = points
    .map(point => Number(point.mtn_score || 0))
    .filter(value => value > 0);
  const robustMax = Math.max(
    percentile(positiveDailyValues, 0.9),
    Math.max(...points.map(point => Number(point.rolling_average || 0)), 0)
  );
  const absoluteMax = Math.max(...values, 0);
  const hasCappedOutliers = absoluteMax > robustMax && robustMax > 0;
  const maxScore = Math.max(
    1,
    Math.ceil(robustMax * 1.2)
  );
  const dailyPath = buildMtnPath(points, 'mtn_score', maxScore);
  const rollingPath = buildMtnPath(points, 'rolling_average', maxScore);
  const overlayConfig = getTaskOverlayConfig(selectedOverlay, overlays);
  const overlayPoints = selectedOverlay && overlayConfig ? overlayConfig.points : [];
  const startTime = points.length ? dateToTime(points[0].date) : null;
  const endTime = points.length ? dateToTime(points[points.length - 1].date) : null;
  const overlayDots = overlayConfig
    ? buildMtnDateDots(overlayPoints, 'overlay_score', overlayConfig.axisMax, startTime, endTime)
    : [];
  const overlayAxisValues = overlayConfig
    ? [0, overlayConfig.axisMax / 4, overlayConfig.axisMax / 2, (overlayConfig.axisMax * 3) / 4, overlayConfig.axisMax]
    : [];
  const selectedOverlayLabel = selectedOverlay ? TREND_OVERLAY_DEFS[selectedOverlay].label : '';
  const selectedOverlayStats = selectedOverlay && overlayConfig ? overlayStats(overlayPoints, startTime, endTime) : null;
  const overlayStatus = selectedOverlay && overlayErrors[selectedOverlay]
    ? `${selectedOverlayLabel} data could not be loaded.`
    : selectedOverlayStats && selectedOverlayStats.loaded === 0
      ? `${selectedOverlayLabel}: endpoint returned 0 days. Response: ${overlayErrors[`${selectedOverlay}Shape`] || 'unknown'}.`
      : selectedOverlayStats && selectedOverlayStats.total === 0
        ? `${selectedOverlayLabel}: ${selectedOverlayStats.loaded} days loaded (${formatShortDate(selectedOverlayStats.firstDate)}-${formatShortDate(selectedOverlayStats.lastDate)}), none overlap this chart.`
      : selectedOverlayStats
        ? `${selectedOverlayLabel}: ${selectedOverlayStats.total} days loaded, ${selectedOverlayStats.nonZero} non-zero.`
        : '';
  const gridValues = [0, maxScore / 4, maxScore / 2, (maxScore * 3) / 4, maxScore];
  const tickIndexes = Array.from(new Set([
    0,
    Math.floor((points.length - 1) * 0.25),
    Math.floor((points.length - 1) * 0.5),
    Math.floor((points.length - 1) * 0.75),
    points.length - 1
  ])).filter(index => index >= 0 && points[index]);

  return (
    <div className="rounded-lg border bg-white p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">MTN Score Trend</h2>
          <div className="mt-2 flex flex-wrap gap-4 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-slate-300" /> Daily</span>
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue-600" /> 7-day average</span>
            {selectedOverlay && (
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: TREND_OVERLAY_DEFS[selectedOverlay].color }} />
                {TREND_OVERLAY_DEFS[selectedOverlay].label}
              </span>
            )}
            {hasCappedOutliers && (
              <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-rose-400" /> Outlier capped</span>
            )}
          </div>
          {overlayStatus && (
            <div className={`mt-1 text-[11px] ${overlayErrors[selectedOverlay] ? 'text-rose-600' : 'text-slate-400'}`}>
              {overlayStatus}
            </div>
          )}
        </div>
        <TrendOverlayButtons selected={selectedOverlay} onSelect={setSelectedOverlay} />
      </div>

      <div className="mt-4 overflow-hidden rounded-md bg-slate-50">
        <svg viewBox={`0 0 ${MTN_CHART_WIDTH} ${MTN_CHART_HEIGHT}`} className="h-64 w-full">
          {gridValues.map(value => {
            const y = MTN_CHART_HEIGHT - MTN_CHART_BOTTOM_PADDING - (value / maxScore) * (MTN_CHART_HEIGHT - MTN_CHART_PADDING - MTN_CHART_BOTTOM_PADDING);
            return (
              <g key={value}>
                <line x1={MTN_CHART_PADDING} x2={MTN_CHART_WIDTH - MTN_CHART_PADDING} y1={y} y2={y} stroke="#e2e8f0" />
                <text x={6} y={y + 4} className="fill-slate-400 text-[10px]">{formatMtnNumber(value)}</text>
              </g>
            );
          })}
          {overlayAxisValues.map(value => {
            const y = MTN_CHART_HEIGHT - MTN_CHART_BOTTOM_PADDING - (value / overlayConfig.axisMax) * (MTN_CHART_HEIGHT - MTN_CHART_PADDING - MTN_CHART_BOTTOM_PADDING);
            return (
              <text key={`overlay-axis-${value}`} x={MTN_CHART_WIDTH - MTN_CHART_PADDING + 6} y={y + 4} className="fill-slate-400 text-[10px]">
                {value.toFixed(selectedOverlay === 'journal' ? 1 : 0)}
              </text>
            );
          })}
          <line x1={MTN_CHART_WIDTH - MTN_CHART_PADDING} x2={MTN_CHART_WIDTH - MTN_CHART_PADDING} y1={MTN_CHART_PADDING} y2={MTN_CHART_HEIGHT - MTN_CHART_BOTTOM_PADDING} stroke="#cbd5e1" />
          <path d={dailyPath} fill="none" stroke="#cbd5e1" strokeWidth="2" />
          <path d={rollingPath} fill="none" stroke="#2563eb" strokeWidth="3" strokeLinecap="round" />
          {selectedOverlay && overlayConfig && (
            <>
              <path
                d={buildMtnDatePath(overlayPoints, 'overlay_score', overlayConfig.axisMax, startTime, endTime)}
                fill="none"
                stroke={TREND_OVERLAY_DEFS[selectedOverlay].color}
                strokeWidth="2"
                strokeLinecap="round"
                strokeDasharray="5 4"
              />
              {overlayDots.map(point => (
                <circle key={`${selectedOverlay}-${point.date}`} cx={point.x} cy={point.y} r="2.2" fill={TREND_OVERLAY_DEFS[selectedOverlay].color} />
              ))}
            </>
          )}
          {points.map((point, index) => {
            const value = Number(point.mtn_score || 0);
            if (value <= maxScore) return null;
            const x = MTN_CHART_PADDING + (index / Math.max(points.length - 1, 1)) * (MTN_CHART_WIDTH - MTN_CHART_PADDING * 2);
            return (
              <circle
                key={`outlier-${point.date}`}
                cx={x}
                cy={MTN_CHART_PADDING}
                r="3"
                fill="#fb7185"
              >
                <title>{`${formatShortDate(point.date)}: ${formatMtnNumber(value)} MTN`}</title>
              </circle>
            );
          })}
          {tickIndexes.map(index => {
            const x = MTN_CHART_PADDING + (index / Math.max(points.length - 1, 1)) * (MTN_CHART_WIDTH - MTN_CHART_PADDING * 2);
            return (
              <g key={points[index].date}>
                <line x1={x} x2={x} y1={MTN_CHART_HEIGHT - MTN_CHART_BOTTOM_PADDING + 4} y2={MTN_CHART_HEIGHT - MTN_CHART_BOTTOM_PADDING + 9} stroke="#94a3b8" />
                <text x={x} y={MTN_CHART_HEIGHT - 18} textAnchor="middle" className="fill-slate-400 text-[10px]">
                  {formatShortDate(points[index].date)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
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

function TaskMtnTrendsTab({ trends, overlayTrends = { habits: [], journal: [] }, overlayErrors = {}, loading, error }) {
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
  const overlays = {
    habits: overlayTrends.habits,
    tasks: extractTrendChart(trends),
    journal: overlayTrends.journal,
  };

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

      <TaskMtnTrendChart data={extractTrendChart(trends)} overlays={overlays} overlayErrors={overlayErrors} />
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
