import { useState, useEffect } from 'react';
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';
import axios from 'axios';

export default function TodoList({ apiUrl, userNumber }) {
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
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [sortOrder, setSortOrder] = useState([]);
  const [completingTasks, setCompletingTasks] = useState([]);

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
    if (sortOrder.length === 0) return tasks;
    
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
    setFilterType('all');
    setSelectedProject('');
    setSelectedDelegate('');
    setSelectedGoal('');
  };

  const hasActiveFilters = selectedProject || selectedDelegate || selectedGoal || filterType !== 'all';

  const sortedTasks = getSortedTasks();

  return (
    <div className="flex h-full">
      {/* Filter Sidebar */}
      <FilterSidebar
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

      {/* Main Content */}
      <div className="flex-1 overflow-auto">
        <div className="max-w-7xl mx-auto p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold text-slate-800 hidden lg:block">
                Your To-Do List
              </h1>
              <p className="text-slate-600 mt-1">
                {filterType === 'due_today' && 'Tasks due today or overdue'}
                {filterType === 'next_7_days' && 'Tasks due in the next 7 days'}
                {filterType === 'all' && 'All tasks'}
                {selectedProject && ` • Project: ${selectedProject}`}
                {selectedDelegate && ` • Delegated to: ${selectedDelegate}`}
                {selectedGoal && ` • Goal: ${goals.find(g => g.id === parseInt(selectedGoal))?.goal_text}`}
              </p>
            </div>
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2"
            >
              <span className="text-xl">+</span>
              <span className="hidden lg:inline">Add Task</span>
            </button>
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

          {/* Loading State */}
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : sortedTasks.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              No tasks found
            </div>
          ) : (
            /* Task List */
            <DragDropContext onDragEnd={handleDragEnd}>
              <Droppable droppableId="tasks">
                {(provided) => (
                  <div
                    {...provided.droppableProps}
                    ref={provided.innerRef}
                    className="space-y-1"
                  >
                    {sortedTasks.map((task, index) => (
                      <Draggable
                        key={task.id}
                        draggableId={task.id.toString()}
                        index={index}
                      >
                        {(provided, snapshot) => (
                          <TaskRow
                            task={task}
                            index={index}
                            isEditing={editingTaskId === task.id}
                            isCompleting={completingTasks.includes(task.id)}
                            onStartEdit={() => setEditingTaskId(task.id)}
                            onCancelEdit={() => setEditingTaskId(null)}
                            onUpdate={(updates) => updateTask(task.id, updates)}
                            onToggle={() => toggleTaskComplete(task.id)}
                            onDelete={() => deleteTask(task.id)}
                            projects={projects}
                            delegates={delegates}
                            goals={goals}
                            provided={provided}
                            snapshot={snapshot}
                          />
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </DragDropContext>
          )}
        </div>
      </div>
    </div>
  );
}

// Filter Sidebar Component
function FilterSidebar({
  filterType,
  setFilterType,
  selectedProject,
  setSelectedProject,
  selectedDelegate,
  setSelectedDelegate,
  selectedGoal,
  setSelectedGoal,
  projects,
  delegates,
  goals,
  hasActiveFilters,
  clearFilters
}) {
  return (
    <div className="w-64 border-r border-gray-200 bg-white p-4 overflow-y-auto hidden lg:block">
      {/* Due Date Section */}
      <div className="mb-6">
        <h3 className="text-sm font-semibold text-slate-700 mb-2 uppercase">Due Date</h3>
        <div className="space-y-1">
          {[
            { value: 'due_today', label: 'Due Today' },
            { value: 'next_7_days', label: 'Next 7 Days' },
            { value: 'all', label: 'All Tasks' }
          ].map((filter) => (
            <button
              key={filter.value}
              onClick={() => setFilterType(filter.value)}
              className={`
                w-full text-left px-3 py-2 rounded
                ${filterType === filter.value
                  ? 'bg-blue-50 text-blue-700 font-medium'
                  : 'text-slate-600 hover:bg-gray-50'
                }
              `}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      {/* Goals Section */}
      <div className="mb-6">
        <h3 className="text-sm font-semibold text-slate-700 mb-2 uppercase">Goals</h3>
        <div className="space-y-1">
          {goals.length === 0 ? (
            <p className="text-xs text-slate-500 px-3 py-2">No goals yet</p>
          ) : (
            goals.map((goal) => (
              <button
                key={goal.id}
                onClick={() => setSelectedGoal(selectedGoal === goal.id ? '' : goal.id.toString())}
                className={`
                  w-full text-left px-3 py-2 rounded text-sm
                  ${selectedGoal === goal.id.toString()
                    ? 'bg-green-50 text-green-700 font-medium'
                    : 'text-slate-600 hover:bg-gray-50'
                  }
                `}
                title={goal.goal_text}
              >
                🎯 {goal.goal_text.length > 30 ? goal.goal_text.substring(0, 30) + '...' : goal.goal_text}
              </button>
            ))
          )}
        </div>
      </div>

      {/* Projects Section */}
      <div className="mb-6">
        <h3 className="text-sm font-semibold text-slate-700 mb-2 uppercase">Projects</h3>
        <div className="space-y-1">
          {projects.map((project) => (
            <button
              key={project}
              onClick={() => setSelectedProject(selectedProject === project ? '' : project)}
              className={`
                w-full text-left px-3 py-2 rounded text-sm
                ${selectedProject === project
                  ? 'bg-amber-50 text-amber-700 font-medium'
                  : 'text-slate-600 hover:bg-gray-50'
                }
              `}
            >
              📁 {project}
            </button>
          ))}
        </div>
      </div>

      {/* Delegated To Section */}
      <div className="mb-6">
        <h3 className="text-sm font-semibold text-slate-700 mb-2 uppercase">Delegated To</h3>
        <div className="space-y-1">
          {delegates.map((delegate) => (
            <button
              key={delegate}
              onClick={() => setSelectedDelegate(selectedDelegate === delegate ? '' : delegate)}
              className={`
                w-full text-left px-3 py-2 rounded text-sm
                ${selectedDelegate === delegate
                  ? 'bg-purple-50 text-purple-700 font-medium'
                  : 'text-slate-600 hover:bg-gray-50'
                }
              `}
            >
              👤 {delegate}
            </button>
          ))}
        </div>
      </div>

      {/* Clear Filters */}
      {hasActiveFilters && (
        <button
          onClick={clearFilters}
          className="w-full bg-gray-100 hover:bg-gray-200 text-slate-700 px-4 py-2 rounded font-medium transition-colors"
        >
          Clear Filters
        </button>
      )}
    </div>
  );
}

// Task Row Component
function TaskRow({
  task,
  index,
  isEditing,
  isCompleting,
  onStartEdit,
  onCancelEdit,
  onUpdate,
  onToggle,
  onDelete,
  projects,
  delegates,
  goals,
  provided,
  snapshot
}) {
  const [editData, setEditData] = useState({
    title: task.title,
    project: task.project || '',
    due_date: task.due_date || '',
    notes: task.notes || '',
    priority: task.priority || 'medium',
    goal_id: task.goal_id || null
  });

  const [touchStart, setTouchStart] = useState(null);
  const [touchEnd, setTouchEnd] = useState(null);
  const [swipeDistance, setSwipeDistance] = useState(0);

  const minSwipeDistance = 100;

  const onTouchStart = (e) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };

  const onTouchMove = (e) => {
    setTouchEnd(e.targetTouches[0].clientX);
    if (touchStart) {
      const distance = touchStart - e.targetTouches[0].clientX;
      setSwipeDistance(Math.max(0, distance));
    }
  };

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > minSwipeDistance;
    
    if (isLeftSwipe) {
      onDelete();
    }
    
    setSwipeDistance(0);
    setTouchStart(null);
    setTouchEnd(null);
  };

  const getPriorityIcon = (priority) => {
    switch(priority?.toLowerCase()) {
      case 'high': return '🔴';
      case 'medium': return '🟠';
      case 'low': return '🟢';
      default: return '🟡';
    }
  };

  const getDueDateColor = (dueDate) => {
    if (!dueDate) return '';
    const date = new Date(dueDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(date);
    due.setHours(0, 0, 0, 0);
    const diff = Math.floor((due - today) / (1000 * 60 * 60 * 24));

    if (diff < 0) return 'bg-red-500 text-white';
    if (diff === 0) return 'bg-orange-500 text-white';
    if (diff <= 3) return 'bg-amber-500 text-white';
    return 'bg-green-500 text-white';
  };

  const formatDueDate = (dueDate) => {
    if (!dueDate) return '';
    const date = new Date(dueDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(date);
    due.setHours(0, 0, 0, 0);
    const diff = Math.floor((due - today) / (1000 * 60 * 60 * 24));

    if (diff < 0) return `Overdue ${Math.abs(diff)}d`;
    if (diff === 0) return 'Today';
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  if (isEditing) {
    return (
      <div
        ref={provided.innerRef}
        {...provided.draggableProps}
        className="bg-white border-2 border-blue-500 rounded p-4 space-y-3"
      >
        <input
          type="text"
          value={editData.title}
          onChange={(e) => setEditData({ ...editData, title: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Task title"
          autoFocus
        />

        <div className="grid grid-cols-4 gap-2">
          <select
            value={editData.priority}
            onChange={(e) => setEditData({ ...editData, priority: e.target.value })}
            className="px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="high">🔴 High</option>
            <option value="medium">🟠 Medium</option>
            <option value="low">🟢 Low</option>
          </select>

          <input
            type="text"
            value={editData.project}
            onChange={(e) => setEditData({ ...editData, project: e.target.value })}
            list="project-list"
            className="px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Project"
          />
          <datalist id="project-list">
            {projects.map(p => <option key={p} value={p} />)}
          </datalist>

          <input
            type="date"
            value={editData.due_date}
            onChange={(e) => setEditData({ ...editData, due_date: e.target.value })}
            className="px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          />

          <select
            value={editData.goal_id || ''}
            onChange={(e) => setEditData({ ...editData, goal_id: e.target.value ? parseInt(e.target.value) : null })}
            className="px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">No goal</option>
            {goals.map(g => (
              <option key={g.id} value={g.id}>{g.goal_text}</option>
            ))}
          </select>
        </div>

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
      `}
      onClick={onStartEdit}
    >
      <div className={`flex items-start gap-3 ${isCompleting ? 'line-through' : ''}`}>
        <div
          {...provided.dragHandleProps}
          className="text-slate-300 cursor-grab active:cursor-grabbing mt-1"
          onClick={(e) => e.stopPropagation()}
        >
          ⋮⋮
        </div>

        <span className="text-sm text-slate-500 w-6 mt-1">{index + 1}</span>

        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
          className="flex-shrink-0 text-2xl hover:scale-110 transition-transform"
          title="Click to mark complete"
        >
          {getPriorityIcon(task.priority)}
        </button>

        <div className="flex-1 min-w-0">
          <div className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-slate-800 text-base">{task.title}</span>
              
              {task.due_date && (
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${getDueDateColor(task.due_date)}`}>
                  {formatDueDate(task.due_date)}
                </span>
              )}
            </div>
            
            {task.notes && (
              <p className="text-sm text-slate-600 leading-relaxed">{task.notes}</p>
            )}
            
            {(task.goal_id || task.project || task.delegated_to) && (
              <div className="flex items-center gap-2 flex-wrap">
                {task.goal_id && (
                  <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs font-medium">
                    🎯 {goals.find(g => g.id === task.goal_id)?.goal_text || 'Goal'}
                  </span>
                )}
                
                {task.project && (
                  <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-xs">
                    📁 {task.project}
                  </span>
                )}
                
                {task.delegated_to && (
                  <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs">
                    👤 {task.delegated_to}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Add Task Form Component
function AddTaskForm({ onAdd, onCancel, projects, delegates, goals }) {
  const getTodayDate = () => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  };

  const [formData, setFormData] = useState({
    title: '',
    project: '',
    delegated_to: '',
    due_date: getTodayDate(),
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
      due_date: getTodayDate(),
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
          {goals.map(g => (
            <option key={g.id} value={g.id}>{g.goal_text.length > 25 ? g.goal_text.substring(0, 25) + '...' : g.goal_text}</option>
          ))}
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
