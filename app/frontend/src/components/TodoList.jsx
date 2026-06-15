// frontend/src/components/TodoList.jsx
import { useState, useEffect, useRef } from 'react';
import { DragDropContext, Droppable } from 'react-beautiful-dnd';
import axios from 'axios';
import TaskItem from './TodoList/TaskItem';
import TaskModal from './TodoList/TaskModal';
import BulkActionModal from './TodoList/BulkActionModal';
import FilterSection from './TodoList/FilterSection';
import { DailyMtnNeedle, MtnBreakdownModal, TaskMtnTrendsTab, TrendsErrorBoundary } from './TodoList/MtnTrends';
import { getTodayET, getETDate, formatDateForInput, isOverdueET, getLongTermGoals, MTN_TAG_OPTIONS } from '../utils/taskHelpers';
import { addDays, dateFromKey, formatCalendarRangeLabel, formatDateKey, formatMonthShort, formatShortDate, getRollingCalendarDays } from '../utils/todoDateLogic.js';
import { buildDailyMtnBenchmark } from '../utils/todoMtnTrends.js';
import { getSortedTasks as sortTodoTasks, getVisibleTaskScore as resolveVisibleTaskScore } from '../utils/todoListLogic';
import { useLanguage } from '../i18n/LanguageContext';
import { usePriority } from '../hooks/usePriority';

/**
 * TodoList Component - Main Task Management Interface
 * 
 * Features:
 * - Task display with Top 10 prioritization
 * - Drag-and-drop reordering
 * - Multi-select for bulk actions
 * - Filtering (date, search, goal)
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
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGoal, setSelectedGoal] = useState('');
  const [selectedMtnTags, setSelectedMtnTags] = useState([]);
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
  const [columnSort, setColumnSort] = useState(null);
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
      setSearchQuery('');
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
  }, [apiUrl, userNumber, filterType, selectedGoal, timezone]);

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

  const getVisibleTaskScore = (task) => {
    return resolveVisibleTaskScore(task, getTaskScore);
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

  const toggleColumnSort = (key) => {
    setColumnSort(previousSort => {
      if (previousSort?.key !== key) return { key, direction: 'desc' };
      return { key, direction: previousSort.direction === 'desc' ? 'asc' : 'desc' };
    });
  };

  const getSortedTasks = () => {
    return sortTodoTasks({
      tasks,
      selectedMtnTags,
      searchQuery,
      sortOrder,
      columnSort,
      getTaskScore
    });
  };

  const handleDragEnd = (result) => {
    if (!result.destination) return;

    const items = Array.from(getSortedTasks());
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);

    const newOrder = items.map(task => task.id);
    setColumnSort(null);
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
    setSearchQuery('');
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

  const hasActiveFilters = searchQuery.trim() || selectedGoal || selectedMtnTags.length > 0 || filterType !== 'due_today';
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
          <div className={`order-1 min-w-0 lg:order-none ${selectionMode ? '' : 'hidden sm:block'}`}>
            <h1 className="text-3xl font-bold text-slate-800 hidden lg:block">
              {t('tasks.title')}
            </h1>
            <p className={`text-slate-600 mt-1 ${selectionMode ? '' : 'hidden sm:block'}`}>
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
            <div className="order-3 flex justify-center lg:order-none lg:pt-9">
              <DailyMtnNeedle
                score={todayMtnScore}
                completedTasks={todayCompletedTasks}
                benchmark={mtnBenchmark}
                onClick={() => setShowMtnBreakdown(true)}
              />
            </div>
          )}
          <div className="order-2 flex justify-center lg:order-none lg:justify-end">
            <div className="flex flex-wrap justify-center gap-2 lg:justify-end">
              {sortOrder.length > 0 && !selectionMode && activeTab === 'tasks' && (
                <button
                  onClick={resetSortOrder}
                  className="h-10 w-10 inline-flex items-center justify-center bg-slate-300 hover:bg-slate-400 text-slate-800 rounded-lg transition-colors"
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
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            selectedGoal={selectedGoal}
            setSelectedGoal={setSelectedGoal}
            selectedMtnTags={selectedMtnTags}
            mtnTagOptions={MTN_TAG_OPTIONS}
            toggleMtnTagFilter={toggleMtnTagFilter}
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
          <>
            {!selectionMode && (
              <TaskColumnHeader
                columnSort={columnSort}
                onSort={toggleColumnSort}
              />
            )}
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
          </>
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
          todayKey={todayKey}
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

function TaskColumnHeader({ columnSort, onSort }) {
  return (
    <div className="hidden sm:grid grid-cols-[3.75rem_minmax(0,1fr)_10rem_1.75rem] items-center px-3 pb-1 pt-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
      <SortHeaderButton
        label="Urgency"
        sortKey="urgency"
        columnSort={columnSort}
        onSort={onSort}
        className="col-start-1 justify-self-start"
      />
      <SortHeaderButton
        label="Importance"
        sortKey="importance"
        columnSort={columnSort}
        onSort={onSort}
        className="col-start-3 justify-self-end"
      />
    </div>
  );
}

function SortHeaderButton({ label, sortKey, columnSort, onSort, className = '' }) {
  const active = columnSort?.key === sortKey;
  const direction = active ? columnSort.direction : 'desc';

  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      className={`inline-flex items-center gap-1 transition-colors hover:text-slate-600 ${active ? 'text-slate-700' : ''} ${className}`}
      title={`Sort by ${label.toLowerCase()}`}
      aria-label={`Sort by ${label.toLowerCase()}`}
    >
      <span>{label}</span>
      <span
        className={`h-0 w-0 border-x-[3.5px] border-x-transparent transition-transform ${
          active ? 'border-b-[5px] border-b-slate-600' : 'border-b-[5px] border-b-slate-300'
        } ${direction === 'asc' ? 'rotate-180' : ''}`}
        aria-hidden="true"
      />
    </button>
  );
}

function FollowUpModal({
  task,
  followUpDate,
  setFollowUpDate,
  todayKey,
  error,
  saving,
  onCancel,
  onConfirm
}) {
  const startDate = dateFromKey(todayKey) || new Date();
  const endDate = addDays(startDate, 29);
  const calendarDays = getRollingCalendarDays(startDate);
  const selectedDateLabel = followUpDate ? formatShortDate(followUpDate) : 'Choose a date';

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
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-slate-700">Follow-up date</p>
                <p className="text-sm text-slate-500">{selectedDateLabel}</p>
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 p-3">
              <div className="mb-3 text-center text-sm font-semibold text-slate-900">
                {formatCalendarRangeLabel(startDate, endDate)}
              </div>
              <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase text-slate-400">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                  <div key={day} className="py-1">{day}</div>
                ))}
              </div>
              <div className="mt-1 grid grid-cols-7 gap-1">
                {calendarDays.map((date, index) => {
                  const key = date ? formatDateKey(date) : `empty-${index}`;
                  const isSelected = date && key === followUpDate;

                  return date ? (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setFollowUpDate(key)}
                      className={`aspect-square rounded text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                        isSelected
                          ? 'bg-blue-600 text-white hover:bg-blue-700'
                          : 'text-slate-700 hover:bg-slate-100'
                      }`}
                      title={formatMonthShort(date)}
                      aria-pressed={isSelected}
                      autoFocus={index === calendarDays.findIndex(Boolean)}
                    >
                      {date.getDate()}
                    </button>
                  ) : (
                    <div key={key} className="aspect-square" aria-hidden="true" />
                  );
                })}
              </div>
            </div>
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
