// frontend/src/components/TodoList.jsx
import { useState, useEffect } from 'react';
import { DragDropContext, Droppable } from 'react-beautiful-dnd';
import axios from 'axios';
import TaskItem from './TodoList/TaskItem';
import TaskModal from './TodoList/TaskModal';
import BulkActionModal from './TodoList/BulkActionModal';
import FilterSection from './TodoList/FilterSection';
import { getTodayET, isOverdueET, getSortedGoals } from '../utils/taskHelpers';
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
    fetchFilters();
    fetchGoals();
  }, []);

  // Refetch tasks when filters change
  useEffect(() => {
    fetchTasks();
  }, [filterType, selectedProject, selectedDelegate, selectedGoal]);

  // ============================================================================
  // DATA FETCHING
  // ============================================================================

  const fetchFilters = async () => {
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
      if (response.data && Array.isArray(response.data)) {
        // Filter out completed tasks
        let activeTasks = response.data.filter(t => t.status !== 'completed');
        setTasks(activeTasks);
      }
    } catch (err) {
      console.error('Error fetching tasks:', err);
      setError(err.response?.data?.detail || 'Failed to load tasks');
    } finally {
      setLoading(false);
    }
  };

  // ============================================================================
  // TASK SORTING
  // ============================================================================

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
    // Strategic View is an explicit, temporary lens over the user's tasks.
    if (priorityMode && priorityRecommendation && priorityRecommendation.all_scored_tasks) {
      const scoredTasks = priorityRecommendation.all_scored_tasks;
      
      // Sort by score (highest first)
      const sortedByScore = [...scoredTasks].sort((a, b) => b.score - a.score);
      
      // Map back to full task objects
      return sortedByScore
        .map(st => tasks.find(t => t.id === st.task_id))
        .filter(Boolean);
    }
    
    // Manual drag-and-drop order is the default experience.
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
    const overdueTasks = tasks.filter(t => isOverdueET(t.due_date));
    if (overdueTasks.length === 0) {
      alert('No overdue tasks found');
      return;
    }

    if (!confirm(`Set ${overdueTasks.length} overdue task(s) to today?`)) return;

    const today = getTodayET();
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
    const newOrder = getSortedTasks().map(task => task.id);
    saveSortOrder(newOrder);
  };

  useEffect(() => {
    if (priorityMode && priorityRecommendation?.all_scored_tasks) {
      handleApplyPrioritySort();
    }
  }, [priorityMode, priorityRecommendation]);

  const handleMtnFeedback = async (taskId, rating, feedback, tag) => {
    const result = await submitMtnFeedback(taskId, rating, feedback, tag);
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
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-slate-800 hidden lg:block">
              Your To-Do List
            </h1>
            <p className="text-slate-600 mt-1">
              {selectionMode ? (
                <span className="text-blue-600 font-medium">
                  {selectedTasks.length} task(s) selected
                </span>
              ) : priorityMode ? (
                <span className="text-blue-700 font-medium">
                  MTN sort applied. Click a tag to review the reasoning or leave feedback.
                </span>
              ) : (
                <>
                  {filterType === 'due_today' && 'Tasks due today'}
                  {filterType === 'next_7_days' && 'Tasks due in the next 7 days'}
                  {filterType === 'all' && 'All active tasks'}
                  {selectedProject && ` • Project: ${selectedProject}`}
                  {selectedDelegate && ` • Delegated to: ${selectedDelegate}`}
                  {selectedGoal && ` • Goal: ${goals.find(g => g.id === parseInt(selectedGoal))?.title || 'Selected'}`}
                </>
              )}
            </p>
          </div>
          <div className="flex gap-2">
            {sortOrder.length > 0 && !selectionMode && !priorityMode && (
              <button
                onClick={resetSortOrder}
                className="bg-slate-200 hover:bg-slate-300 text-slate-700 px-3 py-2 rounded-lg font-medium transition-colors text-sm"
                title="Return to the default task order"
              >
                ↻ Reset Sort
              </button>
            )}
            {!selectionMode && !priorityMode && (
              <>
                <button
                  onClick={setOverdueToToday}
                  className="bg-orange-500 hover:bg-orange-600 text-white px-3 py-2 rounded-lg font-medium transition-colors text-sm hidden sm:inline-block"
                  title="Set all overdue tasks to today"
                >
                   Overdue → Today
                </button>
                <button
                  onClick={setOverdueToToday}
                  className="bg-orange-500 hover:bg-orange-600 text-white px-3 py-2 rounded-lg font-medium transition-colors text-sm sm:hidden"
                  title="Set all overdue tasks to today"
                >
                  📅
                </button>
                <button
                  onClick={handleRunPrioritization}
                  disabled={priorityLoading || tasks.length === 0}
                  className="bg-slate-800 hover:bg-slate-900 text-white px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {priorityLoading ? (
                    <span className="flex items-center gap-2">
                      <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      <span className="hidden sm:inline">Analyzing...</span>
                    </span>
                  ) : (
                    <span className="hidden sm:inline">Move the Needle</span>
                  )}
                  {!priorityLoading && <span className="sm:hidden">MTN</span>}
                </button>
                <button
                  onClick={openOpportunityModal}
                  disabled={opportunityLoading}
                  className="bg-amber-400 hover:bg-amber-500 text-slate-900 px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  title="Suggest move-the-needle actions"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M9 18h6" />
                    <path d="M10 22h4" />
                    <path d="M12 2a7 7 0 0 0-4 12.74V16h8v-1.26A7 7 0 0 0 12 2Z" />
                  </svg>
                  <span className="hidden lg:inline">Suggest move-the-needle actions</span>
                  <span className="lg:hidden">Suggest</span>
                </button>
                <button
                  onClick={() => {
                    setEditingTask(null);
                    setShowTaskModal(true);
                  }}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                >
                  <span className="hidden sm:inline">+ Add Task</span>
                  <span className="sm:hidden">+</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Filters Section */}
        {!selectionMode && !priorityMode && (
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

        {/* Tasks List */}
        {sortedTasks.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-slate-600 text-lg">No tasks found</p>
            <p className="text-slate-500 text-sm mt-2">
              {hasActiveFilters ? 'Try adjusting your filters' : 'Add a new task to get started!'}
            </p>
          </div>
        ) : (
          <DragDropContext onDragEnd={handleDragEnd}>
            <Droppable droppableId="tasks">
              {(provided) => (
                <div
                  {...provided.droppableProps}
                  ref={provided.innerRef}
                  className="space-y-1"
                >
                  {sortedTasks.map((task, index) => {
                    const scoreData = getTaskScore(task.id);

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
                        priorityMode={priorityMode}
                        priorityScore={scoreData}
                        onMtnFeedback={(rating, feedback, tag) => handleMtnFeedback(task.id, rating, feedback, tag)}
                      />
                    );
                  })}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>
        )}
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
        />
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
    </div>
  );
}
