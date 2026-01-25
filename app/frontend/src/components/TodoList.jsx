import { useState, useEffect } from 'react';
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';
import axios from 'axios';

// Eastern Time timezone helper
const getETDate = () => {
  const now = new Date();
  // Convert to ET (UTC-5)
  const etDate = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  return etDate;
};

const getTodayET = () => {
  const etDate = getETDate();
  return etDate.toISOString().split('T')[0];
};

const isOverdueET = (dateString) => {
  if (!dateString) return false;
  // Parse date string as YYYY-MM-DD and compare directly (no timezone conversion)
  const taskDateStr = dateString.split('T')[0]; // Get just the date part
  const todayStr = getTodayET();
  return taskDateStr < todayStr;
};

const isTodayET = (dateString) => {
  if (!dateString) return false;
  // Compare date strings directly (no timezone conversion)
  const taskDateStr = dateString.split('T')[0]; // Get just the date part
  const todayStr = getTodayET();
  return taskDateStr === todayStr;
};

// Helper function to get next Monday
const getNextMonday = () => {
  const date = getETDate();  // Use ET instead of new Date()
  const day = date.getDay();
  const daysUntilMonday = day === 0 ? 1 : 8 - day; // If Sunday, 1 day. Otherwise, days until next Monday
  date.setDate(date.getDate() + daysUntilMonday);
  return date.toISOString().split('T')[0];
};

// Helper function to sort goals hierarchically
const getSortedGoals = (goals) => {
  const longTerm = goals.filter(g => g.time_horizon === 'long');
  const mediumTerm = goals.filter(g => g.time_horizon === 'medium');
  const shortTerm = goals.filter(g => g.time_horizon === 'short');
  
  const result = [];
  
  longTerm.forEach(ltGoal => {
    result.push(ltGoal);
    
    const relatedMedium = mediumTerm.filter(mt => mt.parent_goal_id === ltGoal.id);
    relatedMedium.forEach(mtGoal => {
      result.push(mtGoal);
      
      const relatedShort = shortTerm.filter(st => st.parent_goal_id === mtGoal.id);
      relatedShort.forEach(stGoal => {
        result.push(stGoal);
      });
    });
  });
  
  mediumTerm.forEach(mt => {
    if (!result.includes(mt)) result.push(mt);
  });
  shortTerm.forEach(st => {
    if (!result.includes(st)) result.push(st);
  });
  
  return result;
};

// Helper function to get goal indentation
const getGoalIndentation = (timeHorizon) => {
  const h = timeHorizon?.toLowerCase();
  if (h === 'long') return '';
  if (h === 'medium') return '\u00A0\u00A0\u00A0\u00A0';
  if (h === 'short') return '\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0';
  return '';
};

export default function TodoList({ apiUrl, userNumber }) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  const [filterType, setFilterType] = useState('due_today');
  const [selectedProject, setSelectedProject] = useState('');
  const [selectedDelegate, setSelectedDelegate] = useState('');
  const [selectedGoal, setSelectedGoal] = useState('');
  const [projects, setProjects] = useState([]);
  const [delegates, setDelegates] = useState([]);
  const [goals, setGoals] = useState([]);
  
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [sortOrder, setSortOrder] = useState([]);
  const [completingTasks, setCompletingTasks] = useState([]);
  const [filtersCollapsed, setFiltersCollapsed] = useState(true);

  // Multi-select state
  const [selectedTasks, setSelectedTasks] = useState([]);
  const [selectionMode, setSelectionMode] = useState(false);
  const [showBulkActionModal, setShowBulkActionModal] = useState(false);

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

    // Read on mount
    readUrlParams();

    // Listen for URL changes (custom event dispatched by MyGoals)
    window.addEventListener('urlchange', readUrlParams);

    return () => {
      window.removeEventListener('urlchange', readUrlParams);
    };
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem('taskSortOrder');
    if (saved) {
      setSortOrder(JSON.parse(saved));
    }
  }, []);

  useEffect(() => {
    fetchFilters();
    fetchGoals();
  }, []);

  useEffect(() => {
    fetchTasks();
  }, [filterType, selectedProject, selectedDelegate, selectedGoal]);

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
      if (selectedGoal) params.goal_id = parseInt(selectedGoal);  // ← Send goal_id to backend

      const response = await axios.get(`${apiUrl}/api/tasks/`, { params });
      if (response.data && Array.isArray(response.data)) {
        // Filter out completed tasks
        let activeTasks = response.data.filter(t => t.status !== 'completed');
        
        // No need to filter by goal here anymore - backend does it
        
        setTasks(activeTasks);
      }
    } catch (err) {
      console.error('Error fetching tasks:', err);
      setError('Failed to load tasks');
    } finally {
      setLoading(false);
    }
  };

  const saveSortOrder = (order) => {
    localStorage.setItem('taskSortOrder', JSON.stringify(order));
    setSortOrder(order);
  };

  const getSortedTasks = () => {
    // If manual drag-and-drop order exists, use it
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
    
    // Default sorting: Top 10 first, then by priority
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
      
      // 3. For non-Top 10 tasks, sort by priority
      const priorityOrder = { 'high': 0, 'medium': 1, 'low': 2 };
      const aPriority = priorityOrder[a.priority?.toLowerCase()] ?? 3;
      const bPriority = priorityOrder[b.priority?.toLowerCase()] ?? 3;
      return aPriority - bPriority;
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

  const toggleTaskComplete = async (taskId) => {
    setCompletingTasks(prev => [...prev, taskId]);
    
    try {
      await axios.patch(
        `${apiUrl}/api/tasks/${taskId}/toggle`,
        {},
        { params: { user_number: userNumber } }
      );
      
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

  const clearFilters = () => {
    setFilterType('due_today');
    setSelectedProject('');
    setSelectedDelegate('');
    setSelectedGoal('');
  };

  const resetSortOrder = () => {
    localStorage.removeItem('taskSortOrder');
    setSortOrder([]);
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

  // Multi-select functions
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

  const hasActiveFilters = selectedProject || selectedDelegate || selectedGoal || filterType !== 'due_today';
  const sortedTasks = getSortedTasks();

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
            {sortOrder.length > 0 && !selectionMode && (
              <button
                onClick={resetSortOrder}
                className="bg-slate-200 hover:bg-slate-300 text-slate-700 px-3 py-2 rounded-lg font-medium transition-colors text-sm"
                title="Reset to priority sorting"
              >
                ↻ Reset Sort
              </button>
            )}
            {!selectionMode && (
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
        {!selectionMode && (
          <div className="bg-white border border-gray-200 rounded-lg mb-6">
            <button
              onClick={() => setFiltersCollapsed(!filtersCollapsed)}
              className="w-full px-4 py-3 flex items-center justify-between text-slate-700 hover:bg-slate-50 transition-colors rounded-lg"
            >
              <span className="font-semibold">Filters</span>
              <span className="text-xl">{filtersCollapsed ? '▼' : '▲'}</span>
            </button>
            
            {!filtersCollapsed && (
              <div className="border-t border-gray-200 p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex-shrink-0">
                    <label className="text-xs font-medium text-slate-600 mb-1 block">Due Date</label>
                    <select
                      value={filterType}
                      onChange={(e) => setFilterType(e.target.value)}
                      className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    >
                      <option value="due_today">Due Today</option>
                      <option value="next_7_days">Next 7 Days</option>
                      <option value="all">All Tasks</option>
                    </select>
                  </div>

                  {projects.length > 0 && (
                    <div className="flex-shrink-0">
                      <label className="text-xs font-medium text-slate-600 mb-1 block">Project</label>
                      <select
                        value={selectedProject}
                        onChange={(e) => setSelectedProject(e.target.value)}
                        className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                      >
                        <option value="">All Projects</option>
                        {projects.map(p => (
                          <option key={p} value={p}>{p}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {delegates.length > 0 && (
                    <div className="flex-shrink-0">
                      <label className="text-xs font-medium text-slate-600 mb-1 block">Delegated To</label>
                      <select
                        value={selectedDelegate}
                        onChange={(e) => setSelectedDelegate(e.target.value)}
                        className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                      >
                        <option value="">All Delegates</option>
                        {delegates.map(d => (
                          <option key={d} value={d}>{d}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {goals.length > 0 && (
                    <div className="flex-shrink-0">
                      <label className="text-xs font-medium text-slate-600 mb-1 block">Goal</label>
                      <select
                        value={selectedGoal}
                        onChange={(e) => setSelectedGoal(e.target.value)}
                        className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                      >
                        <option value="">All Goals</option>
                        {getSortedGoals(goals).map(g => {
                          const displayText = g.title || g.goal_text;
                          const truncatedText = displayText.length > 30 ? displayText.substring(0, 30) + '...' : displayText;
                          const indentation = getGoalIndentation(g.time_horizon);
                          return <option key={g.id} value={g.id}>{indentation}{truncatedText}</option>;
                        })}
                      </select>
                    </div>
                  )}

                  {hasActiveFilters && (
                    <div className="flex-shrink-0 mt-auto">
                      <button
                        onClick={clearFilters}
                        className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-medium transition-colors"
                      >
                        ✕ Clear Filters
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
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
                  {sortedTasks.map((task, index) => (
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
                    />
                  ))}
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
    </div>
  );
}

// Helper Functions
function getPriorityIcon(priority) {
  const p = priority?.toLowerCase();
  if (p === 'high') return '🔴';
  if (p === 'medium') return '🟠';
  if (p === 'low') return '🟢';
  return '🟢';
}

function formatDueDate(dateString) {
  if (!dateString) return '';
  
  // Parse date parts directly from string to avoid timezone issues
  const taskDateStr = dateString.split('T')[0]; // YYYY-MM-DD
  const todayStr = getTodayET(); // YYYY-MM-DD
  
  // Calculate difference in days using string parsing
  const taskParts = taskDateStr.split('-').map(Number);
  const todayParts = todayStr.split('-').map(Number);
  
  const taskDate = new Date(taskParts[0], taskParts[1] - 1, taskParts[2]);
  const todayDate = new Date(todayParts[0], todayParts[1] - 1, todayParts[2]);
  
  const diffTime = taskDate - todayDate;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays < 0) return `Overdue ${Math.abs(diffDays)}d`;
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays <= 7) return `In ${diffDays}d`;
  
  return taskDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getDueDateColor(dateString) {
  if (!dateString) return 'bg-gray-100 text-gray-700';
  
  if (isOverdueET(dateString)) {
    return 'bg-red-100 text-red-700 font-semibold';
  }
  if (isTodayET(dateString)) {
    return 'bg-orange-100 text-orange-700 font-semibold';
  }
  
  // Parse date parts directly from string to avoid timezone issues
  const taskDateStr = dateString.split('T')[0];
  const todayStr = getTodayET();
  
  const taskParts = taskDateStr.split('-').map(Number);
  const todayParts = todayStr.split('-').map(Number);
  
  const taskDate = new Date(taskParts[0], taskParts[1] - 1, taskParts[2]);
  const todayDate = new Date(todayParts[0], todayParts[1] - 1, todayParts[2]);
  
  const diffTime = taskDate - todayDate;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays <= 3) {
    return 'bg-amber-100 text-amber-700';
  }
  
  return 'bg-green-100 text-green-700';
}

// Task Item Component
function TaskItem({
  task,
  index,
  isCompleting,
  isSelected,
  selectionMode,
  onToggle,
  onStartEdit,
  onLongPress,
  onSelectToggle,
  goals
}) {
  const [swipeDistance, setSwipeDistance] = useState(0);
  const [touchStartX, setTouchStartX] = useState(0);
  const [longPressTimer, setLongPressTimer] = useState(null);

  const onTouchStart = (e) => {
    setTouchStartX(e.touches[0].clientX);
    
    const timer = setTimeout(() => {
      if (!selectionMode) {
        onLongPress();
        if (navigator.vibrate) {
          navigator.vibrate(50);
        }
      }
    }, 750);
    setLongPressTimer(timer);
  };

  const onTouchMove = (e) => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      setLongPressTimer(null);
    }
    
    const currentX = e.touches[0].clientX;
    const distance = Math.max(0, touchStartX - currentX);
    setSwipeDistance(Math.min(distance, 100));
  };

  const onTouchEnd = () => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      setLongPressTimer(null);
    }
    setSwipeDistance(0);
  };

  return (
    <Draggable draggableId={String(task.id)} index={index} isDragDisabled={selectionMode}>
      {(provided, snapshot) => (
        <TaskCard
          task={task}
          index={index}
          provided={provided}
          snapshot={snapshot}
          isCompleting={isCompleting}
          isSelected={isSelected}
          selectionMode={selectionMode}
          swipeDistance={swipeDistance}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onToggle={onToggle}
          onStartEdit={onStartEdit}
          onLongPress={onLongPress}
          onSelectToggle={onSelectToggle}
          goals={goals}
        />
      )}
    </Draggable>
  );
}

// Task Card Component
function TaskCard({
  task,
  index,
  provided,
  snapshot,
  isCompleting,
  isSelected,
  selectionMode,
  swipeDistance,
  onTouchStart,
  onTouchMove,
  onTouchEnd,
  onToggle,
  onStartEdit,
  onLongPress,
  onSelectToggle,
  goals
}) {
  const goalLabel =
    goals.find(g => g.id === task.goal_id)?.title ||
    goals.find(g => g.id === task.goal_id)?.goal_text ||
    'Goal';

  const handleClick = (e) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      e.stopPropagation();
      if (!selectionMode) {
        onLongPress();
      } else {
        onSelectToggle();
      }
      return;
    }

    if (selectionMode) {
      e.preventDefault();
      e.stopPropagation();
      onSelectToggle();
      return;
    }

    onStartEdit();
  };

  return (
    <div
      ref={provided.innerRef}
      {...provided.draggableProps}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      style={{
        ...provided.draggableProps.style,
        transform: `${provided.draggableProps.style?.transform || ''} translateX(-${swipeDistance}px)`,
      }}
      className={`
        bg-white border-2 rounded px-3 py-2
        hover:border-gray-300 transition-all cursor-pointer
        ${snapshot.isDragging ? 'opacity-50 scale-98 shadow-lg' : ''}
        ${isCompleting ? 'opacity-60' : ''}
        ${index >= 10 ? 'opacity-40' : ''}
        ${isSelected ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}
      `}
      onClick={handleClick}
    >
      <div className={`flex items-start gap-2 ${isCompleting ? 'line-through' : ''}`}>
        {isSelected && (
          <div className="flex-shrink-0 mt-0.5">
            <div className="w-5 h-5 bg-blue-600 rounded-full flex items-center justify-center">
              <span className="text-white text-xs">✓</span>
            </div>
          </div>
        )}

        {!selectionMode && (
          <div
            {...provided.dragHandleProps}
            className="text-slate-300 cursor-grab active:cursor-grabbing mt-0.5"
            onClick={(e) => e.stopPropagation()}
          >
            ⋮⋮
          </div>
        )}

        {!selectionMode && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
            className="flex-shrink-0 text-2xl hover:scale-110 transition-transform"
            title={`${task.priority} priority - Click to complete`}
          >
            {getPriorityIcon(task.priority)}
          </button>
        )}

        <div className="flex-1 min-w-0">
          <div className="font-medium text-slate-800 text-base break-words leading-tight">
            {task.title}
          </div>

          <div className="flex items-center justify-between mt-1">
            <div>
              {task.due_date && (
                <span
                  className={`px-2 py-0.5 rounded text-xs font-medium ${getDueDateColor(
                    task.due_date
                  )}`}
                >
                  {formatDueDate(task.due_date)}
                </span>
              )}
            </div>

            {task.goal_id && (
              <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-xs font-medium">
                🎯 {goalLabel}
              </span>
            )}
          </div>

          {task.notes && (
            <p className="text-sm text-slate-600 leading-snug mt-1">
              {task.notes}
            </p>
          )}

          {task.delegated_to && (
            <div className="mt-1">
              <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs">
                👤 {task.delegated_to}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Task Modal Component
function TaskModal({ task, onSave, onCancel, onDelete, delegates, goals }) {
  const isEditing = !!task;
  
  const [editData, setEditData] = useState({
    title: task?.title || '',
    delegated_to: task?.delegated_to || '',
    due_date: task?.due_date || getTodayET(),
    priority: task?.priority?.toLowerCase() || 'medium',
    notes: task?.notes || '',
    goal_id: task?.goal_id || null
  });

  const [showDatePicker, setShowDatePicker] = useState(false);

  const setTomorrow = () => {
    const tomorrow = getETDate();  // Use ET instead of new Date()
    tomorrow.setDate(tomorrow.getDate() + 1);
    setEditData({ ...editData, due_date: tomorrow.toISOString().split('T')[0] });
    setShowDatePicker(false);
  };

  const setNextWeek = () => {
    setEditData({ ...editData, due_date: getNextMonday() });
    setShowDatePicker(false);
  };

  const setNextMonth = () => {
    const nextMonth = getETDate();  // Use ET instead of new Date()
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    setEditData({ ...editData, due_date: nextMonth.toISOString().split('T')[0] });
    setShowDatePicker(false);
  };

  const handleSave = () => {
    if (!editData.title.trim()) {
      alert('Please enter a task title');
      return;
    }
    onSave(editData);
  };

  const handleDelete = () => {
    if (confirm('Delete this task?')) {
      onDelete();
    }
  };

  return (
    <>
      <div 
        className="fixed inset-0 bg-black bg-opacity-50 z-40"
        onClick={onCancel}
      />
      
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto">
          <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
            <h2 className="text-xl font-semibold text-slate-800">
              {isEditing ? 'Edit Task' : 'Add Task'}
            </h2>
            <button
              onClick={onCancel}
              className="text-slate-400 hover:text-slate-600 text-2xl leading-none"
            >
              ×
            </button>
          </div>

          <div className="p-4 space-y-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Task Title</label>
              <input
                type="text"
                value={editData.title}
                onChange={(e) => setEditData({ ...editData, title: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-base"
                placeholder="What needs to be done?"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Due Date</label>
              <div className="relative">
                <div 
                  onClick={() => setShowDatePicker(!showDatePicker)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white cursor-pointer hover:border-blue-400 transition-colors flex items-center justify-between"
                >
                  <span className={editData.due_date ? 'text-slate-800' : 'text-slate-400'}>
                    {editData.due_date ? new Date(editData.due_date).toLocaleDateString('en-US', { 
                      weekday: 'short', 
                      month: 'short', 
                      day: 'numeric',
                      year: 'numeric'
                    }) : 'No due date'}
                  </span>
                  <span className="text-slate-400">📅</span>
                </div>

                {showDatePicker && (
                  <div 
                    className="absolute z-10 mt-2 w-full bg-white border border-gray-200 rounded-lg shadow-lg"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="p-2 space-y-1">
                      <button
                        onClick={setTomorrow}
                        className="w-full text-left px-3 py-2 hover:bg-slate-50 rounded text-sm text-slate-700"
                      >
                        🗓️ Tomorrow
                      </button>
                      <button
                        onClick={setNextWeek}
                        className="w-full text-left px-3 py-2 hover:bg-slate-50 rounded text-sm text-slate-700"
                      >
                        📆 Next Monday
                      </button>
                      <button
                        onClick={setNextMonth}
                        className="w-full text-left px-3 py-2 hover:bg-slate-50 rounded text-sm text-slate-700"
                      >
                        🗓️ Next Month
                      </button>
                    </div>

                    <div className="border-t border-gray-200 p-2">
                      <input
                        type="date"
                        value={editData.due_date}
                        onChange={(e) => {
                          setEditData({ ...editData, due_date: e.target.value });
                          setShowDatePicker(false);
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Priority</label>
              <select
                value={editData.priority}
                onChange={(e) => setEditData({ ...editData, priority: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="high">🔴 High Priority</option>
                <option value="medium">🟠 Medium Priority</option>
                <option value="low">🟢 Low Priority</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Goal</label>
              <select
                value={editData.goal_id || ''}
                onChange={(e) => setEditData({ ...editData, goal_id: e.target.value ? parseInt(e.target.value) : null })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="">No goal</option>
                {goals.map(g => {
                  const displayText = g.title || g.goal_text;
                  const truncatedText = displayText.length > 50 ? displayText.substring(0, 50) + '...' : displayText;
                  const indentation = getGoalIndentation(g.time_horizon);
                  return <option key={g.id} value={g.id}>{indentation}{truncatedText}</option>;
                })}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Delegate To</label>
              <input
                type="text"
                value={editData.delegated_to}
                onChange={(e) => setEditData({ ...editData, delegated_to: e.target.value })}
                list="modal-delegate-list"
                placeholder="No one"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <datalist id="modal-delegate-list">
                {delegates.map(d => <option key={d} value={d} />)}
              </datalist>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
              <textarea
                value={editData.notes}
                onChange={(e) => setEditData({ ...editData, notes: e.target.value })}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                placeholder="Add any additional details..."
              />
            </div>
          </div>

          <div className="sticky bottom-0 bg-slate-50 border-t border-gray-200 px-4 py-3 flex items-center justify-between">
            {isEditing ? (
              <button
                onClick={handleDelete}
                className="px-4 py-2 bg-white border border-red-300 hover:bg-red-50 text-red-600 rounded-lg font-medium transition-colors"
              >
                Delete
              </button>
            ) : (
              <div></div>
            )}
            <div className="flex gap-2">
              <button
                onClick={onCancel}
                className="px-4 py-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-lg font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
              >
                {isEditing ? 'Save Changes' : 'Add Task'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// Bulk Action Modal
function BulkActionModal({ selectedCount, onApply, onCancel, delegates, goals }) {
  const [bulkData, setBulkData] = useState({
    due_date: '',
    priority: '',
    goal_id: '',
    delegated_to: ''
  });

  const [showDatePicker, setShowDatePicker] = useState(false);

  const setToday = () => {
    setBulkData({ ...bulkData, due_date: getTodayET() });
    setShowDatePicker(false);
  };

  const setTomorrow = () => {
    const tomorrow = getETDate();  // Use ET instead of new Date()
    tomorrow.setDate(tomorrow.getDate() + 1);
    setBulkData({ ...bulkData, due_date: tomorrow.toISOString().split('T')[0] });
    setShowDatePicker(false);
  };

  const setNextMonday = () => {
    setBulkData({ ...bulkData, due_date: getNextMonday() });
    setShowDatePicker(false);
  };

  const setNextMonth = () => {
    const nextMonth = getETDate();  // Use ET instead of new Date()
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    setBulkData({ ...bulkData, due_date: nextMonth.toISOString().split('T')[0] });
    setShowDatePicker(false);
  };

  const handleApply = () => {
    const updates = {};
    if (bulkData.due_date) updates.due_date = bulkData.due_date;
    if (bulkData.priority) updates.priority = bulkData.priority;
    if (bulkData.goal_id) updates.goal_id = parseInt(bulkData.goal_id);
    if (bulkData.delegated_to) updates.delegated_to = bulkData.delegated_to;

    if (Object.keys(updates).length === 0) {
      alert('Please select at least one field to update');
      return;
    }

    onApply(updates);
  };

  return (
    <>
      <div 
        className="fixed inset-0 bg-black bg-opacity-50 z-40"
        onClick={onCancel}
      />
      
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto">
          <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
            <h2 className="text-xl font-semibold text-slate-800">
              Edit {selectedCount} Task{selectedCount > 1 ? 's' : ''}
            </h2>
            <button
              onClick={onCancel}
              className="text-slate-400 hover:text-slate-600 text-2xl leading-none"
            >
              ×
            </button>
          </div>

          <div className="p-4 space-y-3">
            <p className="text-sm text-slate-600 mb-4">
              Select the fields you want to update. Only selected fields will be changed.
            </p>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Due Date</label>
              <div className="relative">
                <div 
                  onClick={() => setShowDatePicker(!showDatePicker)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white cursor-pointer hover:border-blue-400 transition-colors flex items-center justify-between"
                >
                  <span className={bulkData.due_date ? 'text-slate-800' : 'text-slate-400'}>
                    {bulkData.due_date ? new Date(bulkData.due_date).toLocaleDateString('en-US', { 
                      weekday: 'short', 
                      month: 'short', 
                      day: 'numeric',
                      year: 'numeric'
                    }) : 'Leave unchanged'}
                  </span>
                  <span className="text-slate-400">📅</span>
                </div>

                {showDatePicker && (
                  <div 
                    className="absolute z-10 mt-2 w-full bg-white border border-gray-200 rounded-lg shadow-lg"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="p-2 space-y-1">
                      <button
                        onClick={setToday}
                        className="w-full text-left px-3 py-2 hover:bg-slate-50 rounded text-sm text-slate-700"
                      >
                        📅 Today
                      </button>
                      <button
                        onClick={setTomorrow}
                        className="w-full text-left px-3 py-2 hover:bg-slate-50 rounded text-sm text-slate-700"
                      >
                        🗓️ Tomorrow
                      </button>
                      <button
                        onClick={setNextMonday}
                        className="w-full text-left px-3 py-2 hover:bg-slate-50 rounded text-sm text-slate-700"
                      >
                        📆 Next Monday
                      </button>
                      <button
                        onClick={setNextMonth}
                        className="w-full text-left px-3 py-2 hover:bg-slate-50 rounded text-sm text-slate-700"
                      >
                        🗓️ Next Month
                      </button>
                    </div>

                    <div className="border-t border-gray-200 p-2">
                      <input
                        type="date"
                        value={bulkData.due_date}
                        onChange={(e) => {
                          setBulkData({ ...bulkData, due_date: e.target.value });
                          setShowDatePicker(false);
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Priority</label>
              <select
                value={bulkData.priority}
                onChange={(e) => setBulkData({ ...bulkData, priority: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="">Leave unchanged</option>
                <option value="high">🔴 High Priority</option>
                <option value="medium">🟠 Medium Priority</option>
                <option value="low">🟢 Low Priority</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Goal</label>
              <select
                value={bulkData.goal_id}
                onChange={(e) => setBulkData({ ...bulkData, goal_id: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="">Leave unchanged</option>
                {goals.map(g => {
                  const displayText = g.title || g.goal_text;
                  const truncatedText = displayText.length > 50 ? displayText.substring(0, 50) + '...' : displayText;
                  const indentation = getGoalIndentation(g.time_horizon);
                  return <option key={g.id} value={g.id}>{indentation}{truncatedText}</option>;
                })}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Delegate To</label>
              <input
                type="text"
                value={bulkData.delegated_to}
                onChange={(e) => setBulkData({ ...bulkData, delegated_to: e.target.value })}
                list="bulk-delegate-list"
                placeholder="Leave unchanged"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <datalist id="bulk-delegate-list">
                {delegates.map(d => <option key={d} value={d} />)}
              </datalist>
            </div>
          </div>

          <div className="sticky bottom-0 bg-slate-50 border-t border-gray-200 px-4 py-3 flex items-center justify-end gap-2">
            <button
              onClick={onCancel}
              className="px-4 py-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-lg font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleApply}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
            >
              Apply to {selectedCount} Task{selectedCount > 1 ? 's' : ''}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}