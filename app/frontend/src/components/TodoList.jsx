// frontend/src/components/TodoList.jsx
import { useState, useEffect, useRef } from 'react';
import { DragDropContext, Droppable } from 'react-beautiful-dnd';
import axios from 'axios';
import TaskItem from './TodoList/TaskItem';
import TaskModal from './TodoList/TaskModal';
import BulkActionModal from './TodoList/BulkActionModal';
import FilterSection from './TodoList/FilterSection';
import { DailyMtnNeedle, MtnBreakdownModal, TaskMtnTrendsTab, TrendsErrorBoundary } from './TodoList/MtnTrends';
import {
  DeferNonTop10Modal,
  FloatingSelectionBar,
  FollowUpModal,
  OpportunityModal,
  TaskColumnHeader,
  TodoPageHeader,
  TodoTabs,
} from './TodoList/PageControls';
import { getTodayET, getETDate, formatDateForInput, isOverdueET, getLongTermGoals, MTN_TAG_OPTIONS } from '../utils/taskHelpers';
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
        <TodoPageHeader
          title={t('tasks.title')}
          selectionMode={selectionMode}
          selectedCount={selectedTasks.length}
          activeTab={activeTab}
          sortOrderCount={sortOrder.length}
          taskCount={tasks.length}
          sortedTaskCount={sortedTasks.length}
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
          onAddTask={() => {
            setEditingTask(null);
            setShowTaskModal(true);
          }}
        />

        {!selectionMode && (
          <TodoTabs
            activeTab={activeTab}
            showTaskTrends={showTaskTrends}
            onChangeTab={setActiveTab}
          />
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

      {showDeferModal && (
        <DeferNonTop10Modal
          taskCount={sortedTasks.length}
          loading={deferLoading}
          onCancel={() => setShowDeferModal(false)}
          onConfirm={deferNonTop10Tasks}
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

