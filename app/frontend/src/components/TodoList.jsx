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

// Helper function to get priority color
const getPriorityColor = (priority) => {
  const p = priority?.toLowerCase();
  if (p === 'high') return 'bg-red-500';
  if (p === 'medium') return 'bg-orange-500';
  if (p === 'low') return 'bg-green-500';
  return 'bg-gray-400';
};

// Helper function to get priority icon
const getPriorityIcon = (priority) => {
  const p = priority?.toLowerCase();
  if (p === 'high') return '🔴';
  if (p === 'medium') return '🟠';
  if (p === 'low') return '🟢';
  return '⚪';
};

// Helper function to sort tasks by priority
const sortTasksByPriority = (tasks) => {
  const priorityOrder = { 'high': 0, 'medium': 1, 'low': 2 };
  return [...tasks].sort((a, b) => {
    const aPriority = priorityOrder[a.priority?.toLowerCase()] ?? 3;
    const bPriority = priorityOrder[b.priority?.toLowerCase()] ?? 3;
    return aPriority - bPriority;
  });
};

// Helper function to sort goals by time horizon
const sortGoalsByTimeHorizon = (goals) => {
  const horizonOrder = { 'long': 0, 'medium': 1, 'short': 2 };
  return [...goals].sort((a, b) => {
    const aHorizon = horizonOrder[a.time_horizon?.toLowerCase()] ?? 3;
    const bHorizon = horizonOrder[b.time_horizon?.toLowerCase()] ?? 3;
    return aHorizon - bHorizon;
  });
};

// Helper function to get goal indentation
const getGoalIndentation = (timeHorizon) => {
  const h = timeHorizon?.toLowerCase();
  if (h === 'long') return '';
  if (h === 'medium') return '\u00A0\u00A0'; // 2 spaces
  if (h === 'short') return '\u00A0\u00A0\u00A0\u00A0'; // 4 spaces
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
  const [filtersCollapsed, setFiltersCollapsed] = useState(true); // NEW: Filters collapsed by default

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
    return sortTasksByPriority(tasks);
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

  const hasActiveFilters = selectedProject || selectedDelegate || selectedGoal || filterType !== 'due_today';

  const sortedTasks = getSortedTasks();
  const sortedGoals = sortGoalsByTimeHorizon(goals); // Sort goals for dropdown

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-4">
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-800 hidden md:block">Your To-Do List</h1>
          {hasActiveFilters && (
            <p className="text-sm text-slate-600 mt-1">
              {filterType === 'due_today' && 'Tasks due today'}
              {filterType === 'next_7_days' && 'Tasks due in next 7 days'}
              {filterType === 'all' && 'All tasks'}
              {selectedProject && ` • Project: ${selectedProject}`}
              {selectedDelegate && ` • Delegated to: ${selectedDelegate}`}
              {selectedGoal && ` • Goal: ${goals.find(g => g.id === parseInt(selectedGoal))?.goal_text?.substring(0, 30)}...`}
            </p>
          )}
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded font-medium transition-colors"
        >
          <span className="md:inline hidden">+ Add Task</span>
          <span className="md:hidden">+</span>
        </button>
      </div>

      {/* Collapsible Filters Section */}
      <div className="bg-slate-50 border border-slate-200 rounded-lg mb-6">
        <button
          onClick={() => setFiltersCollapsed(!filtersCollapsed)}
          className="w-full px-4 py-3 flex items-center justify-between text-slate-700 hover:bg-slate-100 transition-colors rounded-lg"
        >
          <span className="font-semibold">Filters</span>
          <span className="text-xl">{filtersCollapsed ? '▼' : '▲'}</span>
        </button>
        
        {!filtersCollapsed && (
          <div className="px-4 pb-4 space-y-4 border-t border-slate-200 pt-4">
            {/* Due Date Filter */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Due Date</label>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setFilterType('due_today')}
                  className={`px-4 py-2 rounded ${
                    filterType === 'due_today'
                      ? 'bg-blue-600 text-white'
                      : 'bg-white text-slate-600 border border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  Due Today
                </button>
                <button
                  onClick={() => setFilterType('next_7_days')}
                  className={`px-4 py-2 rounded ${
                    filterType === 'next_7_days'
                      ? 'bg-blue-600 text-white'
                      : 'bg-white text-slate-600 border border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  Next 7 Days
                </button>
                <button
                  onClick={() => setFilterType('all')}
                  className={`px-4 py-2 rounded ${
                    filterType === 'all'
                      ? 'bg-blue-600 text-white'
                      : 'bg-white text-slate-600 border border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  All Tasks
                </button>
              </div>
            </div>

            {/* Project & Delegate Filters */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Project</label>
                <select
                  value={selectedProject}
                  onChange={(e) => setSelectedProject(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">All Projects</option>
                  {projects.map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Delegated To</label>
                <select
                  value={selectedDelegate}
                  onChange={(e) => setSelectedDelegate(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">All</option>
                  {delegates.map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Goal Filter */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Goal</label>
              <select
                value={selectedGoal}
                onChange={(e) => setSelectedGoal(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Goals</option>
                {sortedGoals.map(g => {
                  const displayText = g.title || g.goal_text;
                  const truncatedText = displayText.length > 60 ? displayText.substring(0, 60) + '...' : displayText;
                  const indentation = getGoalIndentation(g.time_horizon);
                  return (
                    <option key={g.id} value={g.id}>
                      {indentation}{truncatedText}
                    </option>
                  );
                })}
              </select>
            </div>

            {/* Clear Filters Button */}
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="text-sm text-blue-600 hover:text-blue-800 font-medium"
              >
                Clear All Filters
              </button>
            )}
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
          goals={sortedGoals}
        />
      )}

      {/* Task List */}
      <DragDropContext onDragEnd={handleDragEnd}>
        <Droppable droppableId="tasks">
          {(provided) => (
            <div
              {...provided.droppableProps}
              ref={provided.innerRef}
              className="space-y-2"
            >
              {sortedTasks.length === 0 ? (
                <div className="text-center py-12 text-slate-500">
                  <p className="text-lg">No tasks found</p>
                  <p className="text-sm mt-2">Add a new task to get started</p>
                </div>
              ) : (
                sortedTasks.map((task, index) => (
                  <Draggable key={task.id} draggableId={String(task.id)} index={index}>
                    {(provided, snapshot) => (
                      editingTaskId === task.id ? (
                        <EditTaskForm
                          task={task}
                          provided={provided}
                          onUpdate={(data) => updateTask(task.id, data)}
                          onCancelEdit={() => setEditingTaskId(null)}
                          onDelete={() => deleteTask(task.id)}
                          projects={projects}
                          delegates={delegates}
                          goals={sortedGoals}
                        />
                      ) : (
                        <TaskRow
                          task={task}
                          index={index}
                          provided={provided}
                          snapshot={snapshot}
                          isCompleting={completingTasks.includes(task.id)}
                          onToggleComplete={() => toggleTaskComplete(task.id)}
                          onEdit={() => setEditingTaskId(task.id)}
                          onDelete={() => deleteTask(task.id)}
                          onUpdatePriority={(priority) => updateTask(task.id, { priority })}
                          goals={goals}
                        />
                      )
                    )}
                  </Draggable>
                ))
              )}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>
    </div>
  );
}

// Task Row Component
function TaskRow({ task, index, provided, snapshot, isCompleting, onToggleComplete, onEdit, onDelete, onUpdatePriority, goals }) {
  const isOverdue = isOverdueET(task.due_date);
  const isToday = isTodayET(task.due_date);
  
  const dueDateColor = isOverdue ? 'bg-red-100 text-red-800' :
                       isToday ? 'bg-orange-100 text-orange-800' :
                       'bg-green-100 text-green-800';

  const dueDateText = isOverdue ? `Overdue` :
                      isToday ? 'Today' :
                      task.due_date ? new Date(task.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) :
                      '';

  const goalText = task.goal_id ? goals.find(g => g.id === task.goal_id)?.goal_text : null;

  return (
    <div
      ref={provided.innerRef}
      {...provided.draggableProps}
      className={`
        bg-white border border-slate-200 rounded-lg p-3 
        ${snapshot.isDragging ? 'shadow-lg opacity-50 scale-98' : 'hover:shadow-md'}
        ${isCompleting ? 'opacity-50 scale-95' : ''}
        transition-all duration-300
      `}
    >
      <div className="flex items-start gap-3">
        {/* Drag Handle */}
        <div {...provided.dragHandleProps} className="text-slate-300 cursor-grab active:cursor-grabbing mt-1">
          ⋮⋮
        </div>

        {/* Task Number */}
        <div className="text-sm text-slate-500 mt-1 w-6">
          {index + 1}
        </div>

        {/* Checkbox */}
        <input
          type="checkbox"
          checked={false}
          onChange={onToggleComplete}
          className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
        />

        {/* Priority Flag with Color Circle */}
        <div className="flex items-center gap-1 mt-1">
          <div className={`w-3 h-3 rounded-full ${getPriorityColor(task.priority)}`}></div>
          <select
            value={task.priority?.toLowerCase() || 'medium'}
            onChange={(e) => onUpdatePriority(e.target.value)}
            className="text-xs border-none bg-transparent cursor-pointer focus:outline-none focus:ring-0 p-0 w-8"
          >
            <option value="high">🔴</option>
            <option value="medium">🟠</option>
            <option value="low">🟢</option>
          </select>
        </div>

        {/* Task Content */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-slate-800">{task.title}</span>
            
            {task.due_date && (
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${dueDateColor}`}>
                {dueDateText}
              </span>
            )}

            {task.project && (
              <span className="px-2 py-0.5 rounded text-xs bg-slate-100 text-slate-700">
                📁 {task.project}
              </span>
            )}

            {task.delegated_to && (
              <span className="px-2 py-0.5 rounded text-xs bg-blue-100 text-blue-700">
                👤 {task.delegated_to}
              </span>
            )}

            {goalText && (
              <span className="px-2 py-0.5 rounded text-xs bg-purple-100 text-purple-700">
                🎯 {goalText.substring(0, 20)}...
              </span>
            )}
          </div>

          {task.notes && (
            <p className="text-sm text-slate-600 mt-1 truncate">• {task.notes}</p>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2">
          <button
            onClick={onEdit}
            className="text-slate-400 hover:text-blue-600 transition-colors"
            title="Edit task"
          >
            ✏️
          </button>
          <button
            onClick={onDelete}
            className="text-slate-400 hover:text-red-600 transition-colors"
            title="Delete task"
          >
            🗑️
          </button>
        </div>
      </div>
    </div>
  );
}


// Edit Task Form Component
function EditTaskForm({ task, provided, onUpdate, onCancelEdit, onDelete, projects, delegates, goals }) {
  const [editData, setEditData] = useState({
    title: task.title,
    project: task.project || '',
    delegated_to: task.delegated_to || '',
    due_date: task.due_date || '',
    priority: task.priority,
    notes: task.notes || '',
    goal_id: task.goal_id || null
  });

  return (
    <div
      ref={provided.innerRef}
      {...provided.draggableProps}
      className="bg-blue-50 border-2 border-blue-300 rounded-lg p-4 space-y-3"
    >
      <h3 className="font-semibold text-slate-800">Edit Task</h3>
      
      <input
        type="text"
        value={editData.title}
        onChange={(e) => setEditData({ ...editData, title: e.target.value })}
        className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
        placeholder="Task title"
        autoFocus
      />

      <div className="grid grid-cols-2 gap-2">
        <input
          type="text"
          value={editData.project}
          onChange={(e) => setEditData({ ...editData, project: e.target.value })}
          list="edit-project-list"
          placeholder="Project"
          className="px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <datalist id="edit-project-list">
          {projects.map(p => <option key={p} value={p} />)}
        </datalist>

        <input
          type="date"
          value={editData.due_date}
          onChange={(e) => setEditData({ ...editData, due_date: e.target.value })}
          className="px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <input
          type="text"
          value={editData.delegated_to}
          onChange={(e) => setEditData({ ...editData, delegated_to: e.target.value })}
          list="edit-delegate-list"
          placeholder="Delegate to"
          className="px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <datalist id="edit-delegate-list">
          {delegates.map(d => <option key={d} value={d} />)}
        </datalist>

        <select
          value={editData.priority}
          onChange={(e) => setEditData({ ...editData, priority: e.target.value })}
          className="px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="high">🔴 High</option>
          <option value="medium">🟠 Medium</option>
          <option value="low">🟢 Low</option>
        </select>
      </div>

      <select
        value={editData.goal_id || ''}
        onChange={(e) => setEditData({ ...editData, goal_id: e.target.value ? parseInt(e.target.value) : null })}
        className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <option value="">No goal</option>
        {goals.map(g => {
          const displayText = g.title || g.goal_text;
          const truncatedText = displayText.length > 40 ? displayText.substring(0, 40) + '...' : displayText;
          const indentation = getGoalIndentation(g.time_horizon);
          return (
            <option key={g.id} value={g.id}>
              {indentation}{truncatedText}
            </option>
          );
        })}
      </select>

      <textarea
        value={editData.notes}
        onChange={(e) => setEditData({ ...editData, notes: e.target.value })}
        rows={2}
        className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
        placeholder="Notes"
      />

      <div className="flex gap-2">
        <button
          onClick={() => onUpdate(editData)}
          className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded font-medium"
        >
          Save
        </button>
        <button
          onClick={onCancelEdit}
          className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2 rounded font-medium"
        >
          Cancel
        </button>
        <button
          onClick={onDelete}
          className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded font-medium"
        >
          Delete
        </button>
      </div>
    </div>
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
          {goals.map(g => {
            const displayText = g.title || g.goal_text;
            const truncatedText = displayText.length > 25 ? displayText.substring(0, 25) + '...' : displayText;
            const indentation = getGoalIndentation(g.time_horizon);
            return (
              <option key={g.id} value={g.id}>
                {indentation}{truncatedText}
              </option>
            );
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
