// frontend/src/components/TodoList.jsx
import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import TaskModal from './TodoList/TaskModal';
import BulkActionModal from './TodoList/BulkActionModal';
import FilterSection from './TodoList/FilterSection';
import TaskListPanel from './TodoList/TaskListPanel';
import TodoCalendarView, { DoLaterDialog } from './TodoList/TodoCalendarView';
import OptimizeTodayModal from './TodoList/OptimizeTodayModal';
import { DailyMtnNeedle, MtnBreakdownModal, TaskMtnTrendsTab, TrendsErrorBoundary } from './TodoList/MtnTrends';
import {
  FloatingSelectionBar,
  FollowUpModal,
  OpportunityModal,
  TodoPageHeader,
  TodoTabs,
} from './TodoList/PageControls';
import { getTodayET, isOverdueET, getLongTermGoals, MTN_TAG_OPTIONS } from '../utils/taskHelpers';
import { buildDailyMtnBenchmark } from '../utils/todoMtnTrends.js';
import { buildMtnCapacity, buildSevenDayWindow, findSuitableScheduleDate, getTaskDate } from '../utils/todoCalendarLogic.js';
import { getSortedTasks as sortTodoTasks, getVisibleTaskScore as resolveVisibleTaskScore } from '../utils/todoListLogic';
import { useLanguage } from '../i18n/LanguageContext';
import { usePriority } from '../hooks/usePriority';
import { useTodoFollowUp, useTodoOpportunities, useTodoSelection } from '../hooks/useTodoInteractions';
import { formatShortDate } from '../utils/todoDateLogic.js';

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
  const [showDeferModal, setShowDeferModal] = useState(false);
  const [deferLoading, setDeferLoading] = useState(false);
  const [optimizationTasks, setOptimizationTasks] = useState([]);
  const [activeTab, setActiveTab] = useState('tasks');
  const [columnSort, setColumnSort] = useState(null);
  const [mtnTrends, setMtnTrends] = useState(null);
  const [mtnTrendsLoading, setMtnTrendsLoading] = useState(false);
  const [mtnTrendsError, setMtnTrendsError] = useState(null);
  const [showMtnBreakdown, setShowMtnBreakdown] = useState(false);
  const [listDoLaterTask, setListDoLaterTask] = useState(null);
  const [listUndoMove, setListUndoMove] = useState(null);
  const [todayKey, setTodayKey] = useState(getTodayET(timezone));
  const [selectedCalendarDate, setSelectedCalendarDate] = useState(getTodayET(timezone));
  const [calendarHistoryMode, setCalendarHistoryMode] = useState(false);
  const [calendarHistoryDays, setCalendarHistoryDays] = useState([]);
  const mtnBackfillRequestsRef = useRef(new Set());
  const calendarHistoryRequestRef = useRef(0);
  const appliedPrioritySortRef = useRef(null);

  useEffect(() => {
    if (!listUndoMove) return undefined;
    const timer = setTimeout(() => setListUndoMove(null), 8000);
    return () => clearTimeout(timer);
  }, [listUndoMove]);

  const {
    selectedTasks,
    setSelectedTasks,
    selectionMode,
    setSelectionMode,
    showBulkActionModal,
    setShowBulkActionModal,
    toggleTaskSelection,
    enterSelectionMode,
    exitSelectionMode,
  } = useTodoSelection();

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

  // The list view always opens on today's work. Calendar navigation keeps its
  // own selected date and is intentionally unaffected.
  useEffect(() => {
    if (activeTab === 'tasks') {
      setFilterType('due_today');
    }
  }, [activeTab]);

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
  }, [apiUrl, userNumber, filterType, selectedGoal, timezone, activeTab]);

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
  }, [apiUrl, userNumber, timezone, activeTab, filterType, selectedGoal]);

  const fetchFilters = async () => {
    if (apiUrl == null || !userNumber) return;
    try {
      const response = await axios.get(`${apiUrl}/api/tasks/filters`);
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
        // If a goal is selected, show ALL tasks for that goal, not just due today.
        filter_type: activeTab === 'calendar' || selectedGoal ? 'all' : filterType
      };
      if (selectedGoal) params.goal_id = parseInt(selectedGoal);

      const response = await axios.get(`${apiUrl}/api/tasks/`, { params });
      const taskList = Array.isArray(response.data) ? response.data : [];
      const openTasks = taskList.filter(task => String(task.status || '').toLowerCase() !== 'completed');
      setTasks(openTasks);
      if (!skipMtnBackfill) {
        const calendarDayKeys = new Set(buildSevenDayWindow(todayKey).map(day => day.key));
        const scoringTasks = activeTab === 'calendar'
          ? openTasks.filter(task => calendarDayKeys.has(getTaskDate(task)))
          : openTasks;
        backfillMissingMtnScores(scoringTasks);
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
      const response = await axios.get(`${apiUrl}/api/tasks/mtn-trends`);
      setMtnTrends(response.data);
    } catch (err) {
      console.error('Error fetching MTN trends:', err);
      setMtnTrendsError('Unable to load MTN trends right now.');
    } finally {
      setMtnTrendsLoading(false);
    }
  };

  const fetchCalendarHistory = async (startDate, endDate, historyMode) => {
    setCalendarHistoryMode(historyMode);
    if (!historyMode || apiUrl == null || !userNumber) return;
    const requestId = calendarHistoryRequestRef.current + 1;
    calendarHistoryRequestRef.current = requestId;
    try {
      const response = await axios.get(`${apiUrl}/api/tasks/mtn-history`, {
        params: { start_date: startDate, end_date: endDate },
      });
      if (calendarHistoryRequestRef.current === requestId) {
        setCalendarHistoryDays(Array.isArray(response.data?.days) ? response.data.days : []);
      }
    } catch (err) {
      console.error('Unable to load calendar history:', err);
      if (calendarHistoryRequestRef.current === requestId) setCalendarHistoryDays([]);
    }
  };

  const {
    showOpportunityModal,
    opportunityLoading,
    opportunityError,
    opportunities,
    opportunityActions,
    openOpportunityModal,
    closeOpportunityModal,
    acceptOpportunity,
    declineOpportunity,
  } = useTodoOpportunities({ apiUrl, userNumber, fetchTasks, fetchFilters });

  const {
    showFollowUpModal,
    selectedFollowUpTask,
    followUpDate,
    followUpError,
    followUpSaving,
    setFollowUpDate,
    openFollowUpModal,
    closeFollowUpModal,
    createFollowUp,
  } = useTodoFollowUp({
    apiUrl,
    userNumber,
    fetchTasks,
    fetchFilters,
    fetchMtnTrends,
    setTasks,
    setSortOrder,
  });

  const getVisibleTaskScore = (task) => {
    return resolveVisibleTaskScore(task, getTaskScore);
  };

  const saveSortOrder = (order) => {
    localStorage.setItem('taskSortOrder', JSON.stringify(order));
    setSortOrder(order);

    axios.post(`${apiUrl}/api/tasks/reorder`, {
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
      getTaskScore,
      priorityMode
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

  const handleChangeTab = (nextTab) => {
    setActiveTab(nextTab);
    if (nextTab === 'calendar') {
      setFilterType('all');
      setSelectedMtnTags([]);
      setCalendarHistoryMode(false);
      setSelectedCalendarDate(todayKey);
    }
  };

  const handleCalendarReschedule = async (task, targetDate) => {
    if (!task || !targetDate) return;
    if (targetDate === getTaskDate(task)) return;

    const previousTasks = tasks;
    setTasks(currentTasks =>
      currentTasks.map(currentTask =>
        currentTask.id === task.id
          ? { ...currentTask, due_date: targetDate }
          : currentTask
      )
    );

    try {
      await axios.put(
        `${apiUrl}/api/tasks/${task.id}`,
        { due_date: targetDate }
      );
      await fetchTasks();
      if (showTaskTrends) fetchMtnTrends();
    } catch (err) {
      console.error('Error rescheduling task:', err);
      setTasks(previousTasks);
      alert(err.response?.data?.detail || 'Failed to reschedule task');
    }
  };

  const handleDoLater = async (task, period, dueDate = null) => {
    const previousDueDate = task?.due_date || null;
    const confirmedDate = period === 'confirmed_date' ? dueDate : null;
    const targetDate = findSuitableScheduleDate({
      tasks,
      task,
      todayKey,
      period,
      dueDate,
      capacity: calendarMtnCapacity,
      getTaskScore,
    }) || confirmedDate;
    if (!targetDate) {
      const nextPeriod = period === 'later_this_week' ? 'next_week' : period;
      const deadlineSafeFallback = findSuitableScheduleDate({
        tasks, task, todayKey, period: nextPeriod, dueDate, capacity: calendarMtnCapacity, getTaskScore,
      });
      if (deadlineSafeFallback) {
        return { error: 'no_workday_capacity', fallbackDate: deadlineSafeFallback };
      }
      return { error: 'no_capacity' };
    }

    const updates = { due_date: targetDate };
    const previousTasks = tasks;
    setTasks(currentTasks => currentTasks.map(currentTask => (
      currentTask.id === task.id ? { ...currentTask, ...updates } : currentTask
    )));

    try {
      await axios.put(`${apiUrl}/api/tasks/${task.id}`, updates);
      await fetchTasks({ skipMtnBackfill: true });
      return { taskId: task.id, previousDueDate, targetDate };
    } catch (err) {
      console.error('Error scheduling task for later:', err);
      setTasks(previousTasks);
      alert(err.response?.data?.detail || t('calendar.doLaterFailed', 'Failed to schedule this task.'));
      return null;
    }
  };

  const handleUndoDoLater = async ({ taskId, previousDueDate }) => {
    const updates = { due_date: previousDueDate };
    try {
      await axios.put(`${apiUrl}/api/tasks/${taskId}`, updates);
      await fetchTasks({ skipMtnBackfill: true });
      return true;
    } catch (err) {
      console.error('Error undoing task schedule:', err);
      alert(err.response?.data?.detail || t('calendar.undoFailed', 'Failed to undo the move.'));
      return false;
    }
  };

  const toggleTaskComplete = async (taskId) => {
    setCompletingTasks(prev => [...prev, taskId]);
    
    try {
      await axios.patch(
        `${apiUrl}/api/tasks/${taskId}/toggle`,
        {}
      );
      window.dispatchEvent(new Event('alfred-sidebar-counts-refresh'));
      
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
      await axios.delete(`${apiUrl}/api/tasks/${taskId}`);
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
        updates
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
        taskData
      );
      await fetchTasks();
      setShowTaskModal(false);
    } catch (err) {
      console.error('Error adding task:', err);
      alert('Failed to add task');
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
    axios.post(`${apiUrl}/api/tasks/reorder/reset`).catch(err => {
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
            { due_date: today }
          )
        )
      );
      await fetchTasks();
    } catch (err) {
      console.error('Error updating overdue tasks:', err);
      alert('Failed to update some tasks');
    }
  };

  const openDeferNonTop10Modal = async () => {
    const optimizationDate = activeTab === 'calendar' ? selectedCalendarDate : todayKey;
    setDeferLoading(true);
    try {
      const response = await axios.get(`${apiUrl}/api/tasks/`, {
        params: { filter_type: 'all' },
      });
      const allOpenTasks = (Array.isArray(response.data) ? response.data : [])
        .filter(task => String(task.status || 'open').toLowerCase() !== 'completed');
      const todayTasks = allOpenTasks.filter(task => {
        const taskDate = getTaskDate(task);
        return activeTab === 'calendar'
          ? taskDate === optimizationDate
          : Boolean(taskDate && taskDate <= optimizationDate);
      });
      if (todayTasks.length <= 10) {
        alert(activeTab === 'calendar'
          ? t('optimizeDay.alreadyOptimized', 'The selected day already has 10 or fewer tasks.')
          : t('optimizeToday.alreadyOptimized', 'Today already has 10 or fewer tasks.'));
        return;
      }
      setOptimizationTasks(allOpenTasks);
      setShowDeferModal(true);
    } catch (err) {
      console.error('Error loading tasks for today optimization:', err);
      alert(t('optimizeToday.loadFailed', 'Failed to load all tasks for optimization.'));
    } finally {
      setDeferLoading(false);
    }
  };

  const applyTodayOptimizationMove = async (move) => {
    setDeferLoading(true);
    try {
      await axios.put(
        `${apiUrl}/api/tasks/${move.task.id}`,
        {
          due_date: move.targetDate,
        }
      );
      return true;
    } catch (err) {
      console.error('Error applying today optimization:', err);
      alert(err.response?.data?.detail || t('optimizeToday.applyFailed', 'Failed to apply the optimization changes.'));
      return false;
    } finally {
      setDeferLoading(false);
    }
  };

  const completeTodayOptimizationTask = async (task) => {
    setDeferLoading(true);
    try {
      await axios.patch(
        `${apiUrl}/api/tasks/${task.id}/toggle`,
        {}
      );
      fetchMtnTrends();
      return true;
    } catch (err) {
      console.error('Error completing task during today optimization:', err);
      alert(err.response?.data?.detail || t('optimizeToday.completeFailed', 'Failed to mark this task as done.'));
      return false;
    } finally {
      setDeferLoading(false);
    }
  };

  const finishTodayOptimization = async () => {
    setShowDeferModal(false);
    await fetchTasks({ skipMtnBackfill: true });
  };

  const applyBulkAction = async (updates) => {
    const selectedTaskRecords = tasks.filter(task => selectedTasks.includes(task.id));
    try {
      await Promise.all(
        selectedTaskRecords.map(task => (
          axios.put(
            `${apiUrl}/api/tasks/${task.id}`,
            updates
          )
        ))
      );
      await fetchTasks();
      exitSelectionMode();
      setShowBulkActionModal(false);
      return { applied: true };
    } catch (err) {
      console.error('Error applying bulk action:', err);
      alert('Failed to update some tasks');
      return { error: true };
    }
  };

  // ============================================================================
  // STRATEGIC VIEW OPERATIONS
  // ============================================================================

  const handleRunPrioritization = async () => {
    const result = await runPrioritization();
    if (!result.success) {
      setError(result.error);
      return;
    }
    await fetchTasks({ skipMtnBackfill: true });
  };

  const handleApplyPrioritySort = () => {
    const scoredTasks = priorityRecommendation?.all_scored_tasks || [];
    if (scoredTasks.length === 0 || tasks.length === 0) return;

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
    const recommendationKey = priorityRecommendation?.recommendation_id || priorityRecommendation?.context_id;
    if (
      priorityMode &&
      recommendationKey &&
      appliedPrioritySortRef.current !== recommendationKey &&
      priorityRecommendation?.all_scored_tasks?.length &&
      tasks.length > 0
    ) {
      handleApplyPrioritySort();
      appliedPrioritySortRef.current = recommendationKey;
    }
  }, [priorityMode, priorityRecommendation, tasks]);

  const handleMtnFeedback = async (taskId, rating, feedback, tag, recommendationId, scoreId, adjustedScore) => {
    const result = await submitMtnFeedback(taskId, rating, feedback, tag, recommendationId, scoreId, adjustedScore);
    if (!result.success) {
      alert(result.error);
    } else {
      await fetchTasks({ skipMtnBackfill: true });
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
  const calendarMtnCapacity = buildMtnCapacity(mtnTrends?.trend_chart, todayKey);
  const selectedDayTaskCount = tasks.filter(task => getTaskDate(task) === selectedCalendarDate && String(task.status || 'open').toLowerCase() !== 'completed').length;
  const optimizationTriggerCount = activeTab === 'calendar'
    ? (calendarHistoryMode ? 0 : selectedDayTaskCount)
    : tasks.length;
  const optimizationDate = activeTab === 'calendar' ? selectedCalendarDate : todayKey;

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
        <TodoPageHeader
          title={t('tasks.title')}
          selectionMode={selectionMode}
          selectedCount={selectedTasks.length}
          activeTab={activeTab}
          sortOrderCount={sortOrder.length}
          taskCount={tasks.length}
          sortedTaskCount={optimizationTriggerCount}
          priorityLoading={priorityLoading}
          opportunityLoading={opportunityLoading}
          mtnNeedle={(
            <DailyMtnNeedle
              score={todayMtnScore}
              completedTasks={todayCompletedTasks}
              benchmark={mtnBenchmark}
              onClick={() => setShowMtnBreakdown(true)}
            />
          )}
          onResetSort={resetSortOrder}
          onSetOverdueToToday={setOverdueToToday}
          onRunPrioritization={handleRunPrioritization}
          onOpenOpportunityModal={openOpportunityModal}
          onOpenDeferModal={openDeferNonTop10Modal}
          optimizeButtonLabel={activeTab === 'calendar'
            ? `${t('optimizeDay.button', 'Optimize selected day')}: ${formatShortDate(selectedCalendarDate)}`
            : t('optimizeToday.title', 'Optimize Today')}
          onAddTask={() => {
            setEditingTask(null);
            setShowTaskModal(true);
          }}
        />

        {!selectionMode && (
          <TodoTabs
            activeTab={activeTab}
            showTaskTrends={showTaskTrends}
            onChangeTab={handleChangeTab}
          />
        )}

        {/* Filters Section */}
        {!selectionMode && (activeTab === 'tasks' || activeTab === 'calendar') && (
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

        {activeTab === 'calendar' ? (
          <TodoCalendarView
            activeTab={activeTab}
            tasks={tasks}
            todayKey={todayKey}
            selectedDate={selectedCalendarDate}
            onSelectDate={setSelectedCalendarDate}
            onHistoryModeChange={setCalendarHistoryMode}
            onWindowChange={fetchCalendarHistory}
            selectedMtnTags={selectedMtnTags}
            searchQuery={searchQuery}
            goals={goals}
            getTaskScore={getTaskScore}
            mtnCapacity={calendarMtnCapacity}
            trends={mtnTrends}
            historyDays={calendarHistoryDays}
            t={t}
            onStartEdit={(task) => {
              setEditingTask(task);
              setShowTaskModal(true);
            }}
            onReschedule={handleCalendarReschedule}
            onDoLater={handleDoLater}
            onUndoDoLater={handleUndoDoLater}
            selectionMode={selectionMode}
            selectedTasks={selectedTasks}
            onEnterSelection={enterSelectionMode}
            onSelectToggle={toggleTaskSelection}
          />
        ) : (
          <TaskListPanel
            activeTab={activeTab}
            sortedTasks={sortedTasks}
            hasActiveFilters={hasActiveFilters}
            emptyText={t('tasks.empty')}
            emptyFilteredText={t('tasks.emptyFiltered')}
            emptyNewText={t('tasks.emptyNew')}
            selectionMode={selectionMode}
            columnSort={columnSort}
            onSort={toggleColumnSort}
            onDragEnd={handleDragEnd}
            completingTasks={completingTasks}
            selectedTasks={selectedTasks}
            onToggleTask={toggleTaskComplete}
            onStartEdit={(task) => {
              setEditingTask(task);
              setShowTaskModal(true);
            }}
            onLongPress={enterSelectionMode}
            onSelectToggle={toggleTaskSelection}
            onFollowUp={openFollowUpModal}
            onDoLater={setListDoLaterTask}
            doLaterLabel={t('calendar.doLater', 'Do later')}
            goals={goals}
            priorityMode={priorityMode}
            getVisibleTaskScore={getVisibleTaskScore}
            onMtnFeedback={handleMtnFeedback}
            timezone={timezone}
          />
        )}
      </div>

      {selectionMode && (
        <FloatingSelectionBar
          selectedCount={selectedTasks.length}
          onCancel={exitSelectionMode}
          onEditSelected={() => setShowBulkActionModal(true)}
        />
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

      {listDoLaterTask && (
        <DoLaterDialog
          key={listDoLaterTask.id}
          task={listDoLaterTask}
          t={t}
          onSchedule={handleDoLater}
          onClose={(result) => {
            setListDoLaterTask(null);
            if (result) setListUndoMove(result);
          }}
        />
      )}

      {listUndoMove && (
        <div
          className="fixed bottom-5 right-5 z-50 flex items-center gap-3 rounded-lg bg-slate-900 px-4 py-3 text-sm text-white shadow-xl"
          style={{ bottom: 'calc(1.25rem + var(--alfred-safe-area-bottom))' }}
          role="status"
        >
          <span>{t('calendar.movedTo', 'Task moved to')} {formatShortDate(listUndoMove.targetDate)}</span>
          <button
            type="button"
            className="font-semibold text-blue-300 hover:text-blue-200"
            onClick={async () => {
              const restored = await handleUndoDoLater(listUndoMove);
              if (restored) setListUndoMove(null);
            }}
          >
            {t('common.undo', 'Undo')}
          </button>
          <button type="button" onClick={() => setListUndoMove(null)} className="text-slate-400 hover:text-white" aria-label={t('common.close', 'Close')}>×</button>
        </div>
      )}

      {showDeferModal && (
        <OptimizeTodayModal
          tasks={optimizationTasks}
          todayKey={optimizationDate}
          isSelectedDay={activeTab === 'calendar'}
          capacity={calendarMtnCapacity}
          getTaskScore={getTaskScore}
          loading={deferLoading}
          onCancel={finishTodayOptimization}
          onApplyMove={applyTodayOptimizationMove}
          onMarkDone={completeTodayOptimizationTask}
          t={t}
        />
      )}

      {showOpportunityModal && (
        <OpportunityModal
          opportunities={opportunities}
          opportunityActions={opportunityActions}
          goals={goals}
          loading={opportunityLoading}
          error={opportunityError}
          onClose={closeOpportunityModal}
          onAccept={acceptOpportunity}
          onDecline={declineOpportunity}
        />
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

