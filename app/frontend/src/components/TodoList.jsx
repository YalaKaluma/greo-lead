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
  const taskDate = new Date(dateString);
  const todayET = getETDate();
  todayET.setHours(0, 0, 0, 0);
  taskDate.setHours(0, 0, 0, 0);
  return taskDate < todayET;
};

const isTodayET = (dateString) => {
  if (!dateString) return false;
  const taskDate = new Date(dateString).toISOString().split('T')[0];
  const todayET = getTodayET();
  return taskDate === todayET;
};

// Helper function to sort goals hierarchically
// Groups by parent long-term goal, then shows medium and short under each
const getSortedGoals = (goals) => {
  const longTerm = goals.filter(g => g.time_horizon === 'long');
  const mediumTerm = goals.filter(g => g.time_horizon === 'medium');
  const shortTerm = goals.filter(g => g.time_horizon === 'short');
  
  const result = [];
  
  longTerm.forEach(ltGoal => {
    result.push(ltGoal); // Add long-term goal
    
    // Find medium-term goals associated with this long-term goal
    const relatedMedium = mediumTerm.filter(mt => mt.parent_goal_id === ltGoal.id);
    relatedMedium.forEach(mtGoal => {
      result.push(mtGoal); // Add medium-term goal
      
      // Find short-term goals associated with this medium-term goal
      const relatedShort = shortTerm.filter(st => st.parent_goal_id === mtGoal.id);
      relatedShort.forEach(stGoal => {
        result.push(stGoal); // Add short-term goal
      });
    });
  });
  
  // Add any orphaned goals (those without parent relationships)
  mediumTerm.forEach(mt => {
    if (!result.includes(mt)) result.push(mt);
  });
  shortTerm.forEach(st => {
    if (!result.includes(st)) result.push(st);
  });
  
  return result;
};

// Helper function to get goal indentation based on hierarchy
const getGoalIndentation = (timeHorizon) => {
  const h = timeHorizon?.toLowerCase();
  if (h === 'long') return '';
  if (h === 'medium') return '\u00A0\u00A0\u00A0\u00A0'; // 1 level indent
  if (h === 'short') return '\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0'; // 2 levels indent
  return '';
};

export default function TodoList({ apiUrl, userNumber }) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Filters - DEFAULT to 'due_today'
  const [filterType, setFilterType] = useState('due_today');
  const [selectedProject, setSelectedProject] = useState('');
  const [selectedDelegate, setSelectedDelegate] = useState('');
  const [selectedGoal, setSelectedGoal] = useState('');
  const [projects, setProjects] = useState([]);
  const [delegates, setDelegates] = useState([]);
  const [goals, setGoals] = useState([]);
  
  // UI state
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [sortOrder, setSortOrder] = useState([]);
  const [completingTasks, setCompletingTasks] = useState([]);
  const [filtersCollapsed, setFiltersCollapsed] = useState(true); // Collapsed by default

  // IMPORTANT: Reset filters when component unmounts (leaving page)
  useEffect(() => {
    return () => {
      // Cleanup function - resets filters when leaving page
      setFilterType('due_today');
      setSelectedProject('');
      setSelectedDelegate('');
      setSelectedGoal('');
    };
  }, []);

  // Load sort order from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('taskSortOrder');
    if (saved) {
      setSortOrder(JSON.parse(saved));
    }
  }, []);

  // Fetch filters (projects, delegates, goals)
  useEffect(() => {
    fetchFilters();
    fetchGoals();
  }, []);

  // Fetch tasks when filters change
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
        filter_type: filterType
      };
      if (selectedProject) params.project = selectedProject;
      if (selectedDelegate) params.delegated_to = selectedDelegate;

      const response = await axios.get(`${apiUrl}/api/tasks/`, { params });
      if (response.data && Array.isArray(response.data)) {
        let activeTasks = response.data.filter(t => t.status !== 'completed');
        
        // Filter by goal if selected
        if (selectedGoal) {
          activeTasks = activeTasks.filter(t => t.goal_id === parseInt(selectedGoal));
        }
        
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
    // If user has manually sorted tasks, use that order
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
    
    // Default: sort by priority (High -> Medium -> Low)
    const priorityOrder = { 'high': 0, 'medium': 1, 'low': 2 };
    return [...tasks].sort((a, b) => {
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
      setEditingTaskId(null);
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
      setShowAddForm(false);
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
              {filterType === 'due_today' && 'Tasks due today'}
              {filterType === 'next_7_days' && 'Tasks due in the next 7 days'}
              {filterType === 'all' && 'All active tasks'}
              {selectedProject && ` • Project: ${selectedProject}`}
              {selectedDelegate && ` • Delegated to: ${selectedDelegate}`}
              {selectedGoal && ` • Goal: ${goals.find(g => g.id === parseInt(selectedGoal))?.title || 'Selected'}`}
            </p>
          </div>
          <div className="flex gap-2">
            {sortOrder.length > 0 && (
              <button
                onClick={resetSortOrder}
                className="bg-slate-200 hover:bg-slate-300 text-slate-700 px-3 py-2 rounded-lg font-medium transition-colors text-sm"
                title="Reset to priority sorting"
              >
                ↻ Reset Sort
              </button>
            )}
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
            >
              <span className="hidden sm:inline">+ Add Task</span>
              <span className="sm:hidden">+</span>
            </button>
          </div>
        </div>

        {/* Collapsible Filters Section */}
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
                {/* Due Date Filter */}
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

                {/* Project Filter */}
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

                {/* Delegate Filter */}
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

                {/* Goal Filter */}
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

                {/* Clear Filters Button */}
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

        {/* Add Task Form */}
        {showAddForm && (
          <AddTaskForm
            onAdd={addTask}
            onCancel={() => setShowAddForm(false)}
            projects={projects}
            delegates={delegates}
            goals={goals}
          />
        )}

        {/* Error State */}
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
                  className="space-y-2"
                >
                  {sortedTasks.map((task, index) => (
                    <TaskItem
                      key={task.id}
                      task={task}
                      index={index}
                      isEditing={editingTaskId === task.id}
                      isCompleting={completingTasks.includes(task.id)}
                      onToggle={() => toggleTaskComplete(task.id)}
                      onDelete={() => deleteTask(task.id)}
                      onStartEdit={() => setEditingTaskId(task.id)}
                      onCancelEdit={() => setEditingTaskId(null)}
                      onUpdate={(updates) => updateTask(task.id, updates)}
                      projects={projects}
                      delegates={delegates}
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

      {/* Modal for Editing Task */}
      {editingTaskId && (
        <EditTaskModal
          task={sortedTasks.find(t => t.id === editingTaskId)}
          onUpdate={(updates) => updateTask(editingTaskId, updates)}
          onCancel={() => setEditingTaskId(null)}
          onDelete={() => deleteTask(editingTaskId)}
          projects={projects}
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
  return '🟢'; // default to low
}

function formatDueDate(dateString) {
  if (!dateString) return '';
  
  const taskDate = new Date(dateString);
  const todayET = getETDate();
  todayET.setHours(0, 0, 0, 0);
  taskDate.setHours(0, 0, 0, 0);
  
  const diffTime = taskDate - todayET;
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
  
  const taskDate = new Date(dateString);
  const todayET = getETDate();
  todayET.setHours(0, 0, 0, 0);
  taskDate.setHours(0, 0, 0, 0);
  
  const diffTime = taskDate - todayET;
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
  onToggle,
  onStartEdit,
  goals
}) {
  const [swipeDistance, setSwipeDistance] = useState(0);
  const [touchStartX, setTouchStartX] = useState(0);

  const onTouchStart = (e) => {
    setTouchStartX(e.touches[0].clientX);
  };

  const onTouchMove = (e) => {
    const currentX = e.touches[0].clientX;
    const distance = Math.max(0, touchStartX - currentX);
    setSwipeDistance(Math.min(distance, 100));
  };

  const onTouchEnd = () => {
    setSwipeDistance(0);
  };

  return (
    <Draggable draggableId={String(task.id)} index={index}>
      {(provided, snapshot) => (
        <TaskCard
          task={task}
          index={index}
          provided={provided}
          snapshot={snapshot}
          isCompleting={isCompleting}
          swipeDistance={swipeDistance}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onToggle={onToggle}
          onStartEdit={onStartEdit}
          goals={goals}
        />
      )}
    </Draggable>
  );
}

// Task Card Component - REDESIGNED LAYOUT
function TaskCard({
  task,
  index,
  provided,
  snapshot,
  isCompleting,
  swipeDistance,
  onTouchStart,
  onTouchMove,
  onTouchEnd,
  onToggle,
  onStartEdit,
  goals
}) {
  const goalLabel =
    goals.find(g => g.id === task.goal_id)?.title ||
    goals.find(g => g.id === task.goal_id)?.goal_text ||
    'Goal';

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
        bg-white border border-gray-200 rounded px-3 py-3
        hover:border-gray-300 transition-all cursor-pointer
        ${snapshot.isDragging ? 'opacity-50 scale-98 shadow-lg' : ''}
        ${isCompleting ? 'opacity-60' : ''}
        ${index >= 10 ? 'opacity-40' : ''}
      `}
      onClick={onStartEdit}
    >
      <div className={`flex items-start gap-2 ${isCompleting ? 'line-through' : ''}`}>
        {/* Drag Handle */}
        <div
          {...provided.dragHandleProps}
          className="text-slate-300 cursor-grab active:cursor-grabbing mt-1"
          onClick={(e) => e.stopPropagation()}
        >
          ⋮⋮
        </div>

        {/* Priority */}
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

        {/* CONTENT */}
        <div className="flex-1 min-w-0">
          {/* TITLE */}
          <div className="font-medium text-slate-800 text-base break-words">
            {task.title}
          </div>
                    

                {/* META ROW (structured like Google Tasks) */}
          <div className="flex items-center justify-between mt-2">
          {/* Due date — LEFT */}
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

          {/* Goal — RIGHT */}
          {task.goal_id && (
          <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-xs font-medium">
            🎯 {goalLabel}
          </span>
          )}
          </div>
          

          {/* NOTES */}
          {task.notes && (
            <p className="text-sm text-slate-600 leading-relaxed mt-2">
              {task.notes}
            </p>
          )}

          {/* DELEGATE */}
          {task.delegated_to && (
            <div className="mt-2">
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


// Edit Task Modal Component - Todoist-style
function EditTaskModal({ task, onUpdate, onCancel, onDelete, projects, delegates, goals }) {
  const [editData, setEditData] = useState({
    title: task.title,
    project: task.project || '',
    delegated_to: task.delegated_to || '',
    due_date: task.due_date || '',
    priority: task.priority?.toLowerCase() || 'medium',
    notes: task.notes || '',
    goal_id: task.goal_id || null
  });

  const [showDatePicker, setShowDatePicker] = useState(false);

  // Quick date functions
  const setTomorrow = () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    setEditData({ ...editData, due_date: tomorrow.toISOString().split('T')[0] });
    setShowDatePicker(false);
  };

  const setNextWeek = () => {
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);
    setEditData({ ...editData, due_date: nextWeek.toISOString().split('T')[0] });
    setShowDatePicker(false);
  };

  const setNextMonth = () => {
    const nextMonth = new Date();
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    setEditData({ ...editData, due_date: nextMonth.toISOString().split('T')[0] });
    setShowDatePicker(false);
  };

  const handleSave = () => {
    onUpdate(editData);
  };

  const handleDelete = () => {
    if (confirm('Delete this task?')) {
      onDelete();
      onCancel();
    }
  };

  return (
    <>
      {/* Modal Overlay */}
      <div 
        className="fixed inset-0 bg-black bg-opacity-50 z-40"
        onClick={onCancel}
      />
      
      {/* Modal Content */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
          {/* Modal Header */}
          <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold text-slate-800">Edit Task</h2>
            <button
              onClick={onCancel}
              className="text-slate-400 hover:text-slate-600 text-2xl leading-none"
            >
              ×
            </button>
          </div>

          {/* Modal Body */}
          <div className="p-6 space-y-4">
            {/* Task Title */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Task Title</label>
              <input
                type="text"
                value={editData.title}
                onChange={(e) => setEditData({ ...editData, title: e.target.value })}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-base"
                placeholder="What needs to be done?"
                autoFocus
              />
            </div>

            {/* Due Date Section */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Due Date</label>
              <div className="relative">
                <div 
                  onClick={() => setShowDatePicker(!showDatePicker)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg bg-white cursor-pointer hover:border-blue-400 transition-colors flex items-center justify-between"
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

                {/* Date Picker Dropdown */}
                {showDatePicker && (
                  <div 
                    className="absolute z-10 mt-2 w-full bg-white border border-gray-200 rounded-lg shadow-lg"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {/* Quick Buttons */}
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
                        📆 Next Week
                      </button>
                      <button
                        onClick={setNextMonth}
                        className="w-full text-left px-3 py-2 hover:bg-slate-50 rounded text-sm text-slate-700"
                      >
                        🗓️ Next Month
                      </button>
                    </div>

                    {/* Calendar Picker - Always Visible */}
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

            {/* Priority */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Priority</label>
              <select
                value={editData.priority}
                onChange={(e) => setEditData({ ...editData, priority: e.target.value })}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="high">🔴 High Priority</option>
                <option value="medium">🟠 Medium Priority</option>
                <option value="low">🟢 Low Priority</option>
              </select>
            </div>

            {/* Project */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Project</label>
              <input
                type="text"
                value={editData.project}
                onChange={(e) => setEditData({ ...editData, project: e.target.value })}
                list="modal-project-list"
                placeholder="No project"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <datalist id="modal-project-list">
                {projects.map(p => <option key={p} value={p} />)}
              </datalist>
            </div>

            {/* Goal */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Goal</label>
              <select
                value={editData.goal_id || ''}
                onChange={(e) => setEditData({ ...editData, goal_id: e.target.value ? parseInt(e.target.value) : null })}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
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

            {/* Delegate */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Delegate To</label>
              <input
                type="text"
                value={editData.delegated_to}
                onChange={(e) => setEditData({ ...editData, delegated_to: e.target.value })}
                list="modal-delegate-list"
                placeholder="No one"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <datalist id="modal-delegate-list">
                {delegates.map(d => <option key={d} value={d} />)}
              </datalist>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Notes</label>
              <textarea
                value={editData.notes}
                onChange={(e) => setEditData({ ...editData, notes: e.target.value })}
                rows={3}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                placeholder="Add any additional details..."
              />
            </div>
          </div>

          {/* Modal Footer */}
          <div className="sticky bottom-0 bg-slate-50 border-t border-gray-200 px-6 py-4 flex items-center justify-between">
            <button
              onClick={handleDelete}
              className="px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg font-medium transition-colors"
            >
              🗑️ Delete
            </button>
            <div className="flex gap-2">
              <button
                onClick={onCancel}
                className="px-6 py-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-lg font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// Add Task Form Component
function AddTaskForm({ onAdd, onCancel, projects, delegates, goals }) {
  const [formData, setFormData] = useState({
    title: '',
    project: '',
    delegated_to: '',
    due_date: getTodayET(),
    priority: 'medium',
    notes: '',
    goal_id: null
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.title.trim()) {
      alert('Please enter a task title');
      return;
    }
    onAdd(formData);
    setFormData({
      title: '',
      project: '',
      delegated_to: '',
      due_date: getTodayET(),
      priority: 'medium',
      notes: '',
      goal_id: null
    });
  };

  return (
    <form onSubmit={handleSubmit} className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
      <h3 className="font-semibold text-slate-800 mb-3">Add New Task</h3>
      
      <div className="grid grid-cols-1 md:grid-cols-4 gap-2 mb-2">
        <input
          type="text"
          value={formData.title}
          onChange={(e) => setFormData({ ...formData, title: e.target.value })}
          placeholder="Task title *"
          className="md:col-span-2 px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          required
        />
        
        <input
          type="text"
          value={formData.project}
          onChange={(e) => setFormData({ ...formData, project: e.target.value })}
          list="add-project-list"
          placeholder="Project"
          className="px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <datalist id="add-project-list">
          {projects.map(p => <option key={p} value={p} />)}
        </datalist>

        <input
          type="text"
          value={formData.delegated_to}
          onChange={(e) => setFormData({ ...formData, delegated_to: e.target.value })}
          list="add-delegate-list"
          placeholder="Delegate to"
          className="px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <datalist id="add-delegate-list">
          {delegates.map(d => <option key={d} value={d} />)}
        </datalist>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-6 gap-2">
        <input
          type="date"
          value={formData.due_date}
          onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
          className="px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
        />

        <select
          value={formData.priority}
          onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
          className="px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="high">🔴 High</option>
          <option value="medium">🟠 Medium</option>
          <option value="low">🟢 Low</option>
        </select>

        <select
          value={formData.goal_id || ''}
          onChange={(e) => setFormData({ ...formData, goal_id: e.target.value ? parseInt(e.target.value) : null })}
          className="px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">No goal</option>
          {getSortedGoals(goals).map(g => {
            const displayText = g.title || g.goal_text;
            const truncatedText = displayText.length > 25 ? displayText.substring(0, 25) + '...' : displayText;
            const indentation = getGoalIndentation(g.time_horizon);
            return <option key={g.id} value={g.id}>{indentation}{truncatedText}</option>;
          })}
        </select>

        <input
          type="text"
          value={formData.notes}
          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
          placeholder="Notes (optional)"
          className="md:col-span-2 px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
        />

        <button
          type="submit"
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded font-medium transition-colors"
        >
          + Add
        </button>
      </div>

      <button
        type="button"
        onClick={onCancel}
        className="mt-2 text-sm text-slate-600 hover:text-slate-800"
      >
        Cancel
      </button>
    </form>
  );
}
