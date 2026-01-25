import { useState, useEffect } from 'react';
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';
import axios from 'axios';

// Eastern Time timezone helper
const getETDate = () => {
  const now = new Date();
  const etDate = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  return etDate;
};

const getTodayET = () => {
  const etDate = getETDate();
  return etDate.toISOString().split('T')[0];
};

const isOverdueET = (dateString) => {
  if (!dateString) return false;
  const taskDateStr = dateString.split('T')[0];
  const todayStr = getTodayET();
  return taskDateStr < todayStr;
};

const isTodayET = (dateString) => {
  if (!dateString) return false;
  const taskDateStr = dateString.split('T')[0];
  const todayStr = getTodayET();
  return taskDateStr === todayStr;
};

const getNextMonday = () => {
  const date = getETDate();
  const day = date.getDay();
  const daysUntilMonday = day === 0 ? 1 : 8 - day;
  date.setDate(date.getDate() + daysUntilMonday);
  return date.toISOString().split('T')[0];
};

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

  // Priority Review state
  const [priorityMode, setPriorityMode] = useState(false);
  const [priorityLoading, setPriorityLoading] = useState(false);
  const [priorityRecommendation, setPriorityRecommendation] = useState(null);
  const [priorityDecisions, setPriorityDecisions] = useState({});
  const [showReasonModal, setShowReasonModal] = useState(null);
  const [applyingPriority, setApplyingPriority] = useState(false);

  useEffect(() => {
    return () => {
      setFilterType('due_today');
      setSelectedProject('');
      setSelectedDelegate('');
      setSelectedGoal('');
      setSelectedTasks([]);
      setSelectionMode(false);
      setPriorityMode(false);
    };
  }, []);

  useEffect(() => {
    const readUrlParams = () => {
      const params = new URLSearchParams(window.location.search);
      const goalParam = params.get('goal');
      if (goalParam) {
        setSelectedGoal(goalParam);
        setFiltersCollapsed(false);
      }
    };

    readUrlParams();
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
        filter_type: selectedGoal ? 'all' : filterType
      };
      if (selectedProject) params.project = selectedProject;
      if (selectedDelegate) params.delegated_to = selectedDelegate;
      if (selectedGoal) params.goal_id = parseInt(selectedGoal);

      const response = await axios.get(`${apiUrl}/api/tasks/`, { params });
      if (response.data && Array.isArray(response.data)) {
        let activeTasks = response.data.filter(t => t.status !== 'completed');
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
    // In priority mode, use LLM scoring
    if (priorityMode && priorityRecommendation) {
      const scoredTasks = priorityRecommendation.all_scored_tasks || [];
      
      // Separate accepted (top 10) from rest
      const acceptedIds = Object.entries(priorityDecisions)
        .filter(([_, decision]) => decision === 'accept')
        .map(([taskId]) => parseInt(taskId));
      
      const top10 = scoredTasks.filter(st => acceptedIds.includes(st.task_id));
      const rest = scoredTasks.filter(st => !acceptedIds.includes(st.task_id));
      
      // Map back to full task objects
      const top10Tasks = top10.map(st => tasks.find(t => t.id === st.task_id)).filter(Boolean);
      const restTasks = rest.map(st => tasks.find(t => t.id === st.task_id)).filter(Boolean);
      
      return [...top10Tasks, ...restTasks];
    }

    // Normal mode: use existing sort logic
    if (sortOrder.length > 0) {
      const orderMap = new Map(sortOrder.map((id, index) => [id, index]));
      const sorted = [...tasks].sort((a, b) => {
        const orderA = orderMap.get(a.id);
        const orderB = orderMap.get(b.id);
        
        if (orderA !== undefined && orderB !== undefined) {
          return orderA - orderB;
        }
        if (orderA !== undefined) return -1;
        if (orderB !== undefined) return 1;
        
        return 0;
      });
      return sorted;
    }

    const priorityOrder = { high: 0, medium: 1, low: 2 };
    
    return [...tasks].sort((a, b) => {
      const aPriority = priorityOrder[a.priority?.toLowerCase()] ?? 3;
      const bPriority = priorityOrder[b.priority?.toLowerCase()] ?? 3;
      
      if (aPriority !== bPriority) {
        return aPriority - bPriority;
      }
      
      if (a.due_date && b.due_date) {
        return new Date(a.due_date) - new Date(b.due_date);
      }
      if (a.due_date) return -1;
      if (b.due_date) return 1;
      
      return 0;
    });
  };

  const handleDragEnd = (result) => {
    if (!result.destination || priorityMode) return;
    
    const items = getSortedTasks();
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);
    
    const newOrder = items.map(item => item.id);
    saveSortOrder(newOrder);
  };

  const toggleComplete = async (taskId) => {
    setCompletingTasks(prev => [...prev, taskId]);
    
    try {
      await axios.patch(`${apiUrl}/api/tasks/${taskId}/toggle`, {}, {
        params: { user_number: userNumber }
      });
      
      setTimeout(() => {
        setTasks(prev => prev.filter(t => t.id !== taskId));
        setCompletingTasks(prev => prev.filter(id => id !== taskId));
      }, 300);
      
    } catch (err) {
      console.error('Error toggling task:', err);
      setCompletingTasks(prev => prev.filter(id => id !== taskId));
    }
  };

  const deleteTask = async (taskId) => {
    if (!confirm('Are you sure you want to delete this task?')) return;
    
    try {
      await axios.delete(`${apiUrl}/api/tasks/${taskId}`, {
        params: { user_number: userNumber }
      });
      setTasks(prev => prev.filter(t => t.id !== taskId));
      setSortOrder(prev => prev.filter(id => id !== taskId));
    } catch (err) {
      console.error('Error deleting task:', err);
      alert('Failed to delete task');
    }
  };

  const saveTask = async (taskData) => {
    try {
      if (editingTask) {
        await axios.put(`${apiUrl}/api/tasks/${editingTask.id}`, taskData, {
          params: { user_number: userNumber }
        });
      } else {
        await axios.post(`${apiUrl}/api/tasks/`, {
          ...taskData,
          user_number: userNumber
        });
      }
      
      setShowTaskModal(false);
      setEditingTask(null);
      fetchTasks();
      fetchFilters();
      
    } catch (err) {
      console.error('Error saving task:', err);
      alert('Failed to save task');
    }
  };

  const toggleTaskSelection = (taskId) => {
    setSelectedTasks(prev => 
      prev.includes(taskId) 
        ? prev.filter(id => id !== taskId)
        : [...prev, taskId]
    );
  };

  const selectAllTasks = () => {
    if (selectedTasks.length === tasks.length) {
      setSelectedTasks([]);
    } else {
      setSelectedTasks(tasks.map(t => t.id));
    }
  };

  const applyBulkAction = async (updates) => {
    try {
      await Promise.all(
        selectedTasks.map(taskId =>
          axios.put(`${apiUrl}/api/tasks/${taskId}`, updates, {
            params: { user_number: userNumber }
          })
        )
      );
      
      setShowBulkActionModal(false);
      setSelectedTasks([]);
      setSelectionMode(false);
      fetchTasks();
      
    } catch (err) {
      console.error('Error applying bulk action:', err);
      alert('Failed to update tasks');
    }
  };

  // Priority Review Functions
  const runPrioritization = async () => {
    setPriorityLoading(true);
    setError(null);
    
    try {
      const res = await axios.post(`${apiUrl}/api/priority/run`, {
        user_number: userNumber
      });
      
      setPriorityRecommendation(res.data);
      setPriorityDecisions({});
      setPriorityMode(true);
      
    } catch (err) {
      console.error('Prioritization failed:', err);
      setError(err.response?.data?.detail || 'Failed to generate recommendations');
    } finally {
      setPriorityLoading(false);
    }
  };

  const handlePriorityDecision = async (taskId, action, reason = null) => {
    if (!priorityRecommendation) return;
    
    try {
      await axios.post(`${apiUrl}/api/priority/decision`, {
        recommendation_id: priorityRecommendation.recommendation_id,
        task_id: taskId,
        user_number: userNumber,
        user_action: action,
        user_reason: reason
      });
      
      setPriorityDecisions(prev => ({
        ...prev,
        [taskId]: action
      }));
      
      setShowReasonModal(null);
      
    } catch (err) {
      console.error('Failed to record decision:', err);
      alert('Failed to record decision. Please try again.');
    }
  };

  const applyPriorityChanges = async () => {
    const acceptedTasks = Object.entries(priorityDecisions)
      .filter(([_, decision]) => decision === 'accept')
      .map(([taskId]) => parseInt(taskId));
    
    if (acceptedTasks.length === 0) {
      alert('Please accept at least one task for your Top 10');
      return;
    }
    
    setApplyingPriority(true);
    
    try {
      const res = await axios.post(`${apiUrl}/api/priority/apply`, {
        user_number: userNumber,
        approved_adds: acceptedTasks,
        approved_removes: []
      });
      
      alert(`Success! Updated Top 10 with ${res.data.added} tasks.`);
      
      // Exit priority mode
      setPriorityMode(false);
      setPriorityRecommendation(null);
      setPriorityDecisions({});
      fetchTasks();
      
    } catch (err) {
      console.error('Failed to apply changes:', err);
      alert(`Failed to update Top 10: ${err.response?.data?.detail || err.message}`);
    } finally {
      setApplyingPriority(false);
    }
  };

  const cancelPriorityMode = () => {
    setPriorityMode(false);
    setPriorityRecommendation(null);
    setPriorityDecisions({});
  };

  const getTaskScore = (taskId) => {
    if (!priorityRecommendation) return null;
    const scoredTask = priorityRecommendation.all_scored_tasks?.find(st => st.task_id === taskId);
    return scoredTask;
  };

  // Filter rendering
  const renderFilters = () => (
    <div className="bg-white border-b border-gray-200">
      <div className="px-6 py-4">
        <button
          onClick={() => setFiltersCollapsed(!filtersCollapsed)}
          className="flex items-center justify-between w-full text-left"
        >
          <span className="text-sm font-medium text-gray-700">Filters</span>
          <span className="text-gray-400">{filtersCollapsed ? '▼' : '▲'}</span>
        </button>
        
        {!filtersCollapsed && (
          <div className="mt-4 space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">View</label>
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                disabled={priorityMode}
              >
                <option value="all">All Tasks</option>
                <option value="due_today">Due Today</option>
                <option value="next_7_days">Next 7 Days</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Project</label>
              <select
                value={selectedProject}
                onChange={(e) => setSelectedProject(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                disabled={priorityMode}
              >
                <option value="">All Projects</option>
                {projects.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Delegated To</label>
              <select
                value={selectedDelegate}
                onChange={(e) => setSelectedDelegate(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                disabled={priorityMode}
              >
                <option value="">All Delegates</option>
                {delegates.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Goal</label>
              <select
                value={selectedGoal}
                onChange={(e) => setSelectedGoal(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                disabled={priorityMode}
              >
                <option value="">All Goals</option>
                {getSortedGoals(goals).map(g => {
                  const displayText = g.title || g.goal_text;
                  const truncatedText = displayText.length > 50 ? displayText.substring(0, 50) + '...' : displayText;
                  const indentation = getGoalIndentation(g.time_horizon);
                  return <option key={g.id} value={g.id}>{indentation}{truncatedText}</option>;
                })}
              </select>
            </div>

            {(selectedProject || selectedDelegate || selectedGoal) && (
              <button
                onClick={() => {
                  setSelectedProject('');
                  setSelectedDelegate('');
                  setSelectedGoal('');
                }}
                className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                disabled={priorityMode}
              >
                Clear all filters
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading tasks...</div>
      </div>
    );
  }

  const sortedTasks = getSortedTasks();

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-800">Todo List</h1>
        
        <div className="flex gap-2">
          {!priorityMode && !selectionMode && (
            <>
              <button
                onClick={runPrioritization}
                disabled={priorityLoading || tasks.length === 0}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {priorityLoading ? (
                  <>
                    <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Analyzing...
                  </>
                ) : (
                  <>
                    <span>⚡</span>
                    Prioritize
                  </>
                )}
              </button>
              
              <button
                onClick={() => setSelectionMode(true)}
                className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg font-medium transition-colors"
              >
                Select Multiple
              </button>
            </>
          )}
          
          {priorityMode && (
            <>
              <button
                onClick={cancelPriorityMode}
                className="px-4 py-2 border border-gray-300 hover:bg-gray-50 rounded-lg font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={applyPriorityChanges}
                disabled={applyingPriority || Object.keys(priorityDecisions).length === 0}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {applyingPriority ? 'Applying...' : `Apply ${Object.values(priorityDecisions).filter(d => d === 'accept').length} Changes`}
              </button>
            </>
          )}
          
          {selectionMode && (
            <>
              <button
                onClick={selectAllTasks}
                className="px-4 py-2 border border-gray-300 hover:bg-gray-50 rounded-lg font-medium transition-colors"
              >
                {selectedTasks.length === tasks.length ? 'Deselect All' : 'Select All'}
              </button>
              <button
                onClick={() => setShowBulkActionModal(true)}
                disabled={selectedTasks.length === 0}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
              >
                Edit ({selectedTasks.length})
              </button>
              <button
                onClick={() => {
                  setSelectionMode(false);
                  setSelectedTasks([]);
                }}
                className="px-4 py-2 border border-gray-300 hover:bg-gray-50 rounded-lg font-medium transition-colors"
              >
                Cancel
              </button>
            </>
          )}
          
          {!priorityMode && !selectionMode && (
            <button
              onClick={() => {
                setEditingTask(null);
                setShowTaskModal(true);
              }}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
            >
              + Add Task
            </button>
          )}
        </div>
      </div>

      {/* Priority mode info banner */}
      {priorityMode && (
        <div className="bg-purple-50 border-b border-purple-200 px-6 py-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-purple-800">
                Priority Review Mode - Select your Top 10 tasks
              </p>
              <p className="text-xs text-purple-600 mt-1">
                Click ✓ Accept or ✗ Reject on each task. Accepted tasks will form your Top 10 focus list.
              </p>
            </div>
            {Object.keys(priorityDecisions).length === 0 && (
              <div className="text-xs text-purple-600 bg-purple-100 px-3 py-1 rounded">
                💡 Start by clicking buttons on the right of each task
              </div>
            )}
          </div>
        </div>
      )}

      {error && (
        <div className="mx-6 mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-800 text-sm">{error}</p>
        </div>
      )}

      {/* Filters */}
      {renderFilters()}

      {/* Task List */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {sortedTasks.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-6xl mb-4">✅</div>
            <p className="text-gray-500 text-lg">No tasks to show</p>
            <p className="text-gray-400 text-sm mt-2">Add a task to get started</p>
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
                  {sortedTasks.map((task, index) => {
                    const isCompleting = completingTasks.includes(task.id);
                    const isSelected = selectedTasks.includes(task.id);
                    const scoreData = getTaskScore(task.id);
                    const decision = priorityDecisions[task.id];

                    return (
                      <Draggable
                        key={task.id}
                        draggableId={String(task.id)}
                        index={index}
                        isDragDisabled={selectionMode || priorityMode}
                      >
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            {...provided.dragHandleProps}
                            className={`
                              bg-white border rounded-lg transition-all
                              ${snapshot.isDragging ? 'shadow-lg' : 'shadow-sm'}
                              ${isCompleting ? 'opacity-50 scale-95' : ''}
                              ${isSelected ? 'ring-2 ring-blue-500' : ''}
                              ${decision === 'accept' ? 'border-green-300 bg-green-50' : ''}
                              ${decision === 'reject' ? 'border-red-300 bg-red-50' : ''}
                              ${!decision && priorityMode ? 'hover:border-gray-300' : ''}
                            `}
                          >
                            <div className="p-4">
                              <div className="flex items-start gap-3">
                                {/* Checkbox/Selection */}
                                {selectionMode ? (
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() => toggleTaskSelection(task.id)}
                                    className="mt-1 h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                  />
                                ) : (
                                  <button
                                    onClick={() => toggleComplete(task.id)}
                                    className="mt-1 flex-shrink-0 w-5 h-5 rounded border-2 border-gray-300 hover:border-blue-500 focus:outline-none transition-colors"
                                    disabled={priorityMode}
                                  >
                                    {isCompleting && (
                                      <div className="w-full h-full flex items-center justify-center">
                                        <div className="w-3 h-3 bg-blue-500 rounded-sm"></div>
                                      </div>
                                    )}
                                  </button>
                                )}

                                {/* Task Content */}
                                <div className="flex-1 min-w-0">
                                  {/* Title and Priority */}
                                  <div className="flex items-start gap-2 mb-1">
                                    <h3 className="font-medium text-gray-800 flex-1">
                                      {task.title}
                                    </h3>
                                    {task.priority && (
                                      <span className="text-xs flex-shrink-0">
                                        {task.priority.toLowerCase() === 'high' && '🔴'}
                                        {task.priority.toLowerCase() === 'medium' && '🟠'}
                                        {task.priority.toLowerCase() === 'low' && '🟢'}
                                      </span>
                                    )}
                                  </div>

                                  {/* Notes */}
                                  {task.notes && (
                                    <p className="text-xs text-gray-500 mb-2 italic">
                                      {task.notes}
                                    </p>
                                  )}

                                  {/* Priority Score and Reasoning (in priority mode) */}
                                  {priorityMode && scoreData && (
                                    <div className="mb-2 p-2 bg-gray-50 rounded border border-gray-200">
                                      <div className="flex items-center gap-2 mb-1">
                                        <span className="text-xs font-medium text-blue-600">
                                          Score: {(scoreData.score * 100).toFixed(0)}%
                                        </span>
                                        <span className={`text-xs px-2 py-0.5 rounded ${
                                          scoreData.confidence === 'high' ? 'bg-green-100 text-green-800' :
                                          scoreData.confidence === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                                          'bg-gray-100 text-gray-800'
                                        }`}>
                                          {scoreData.confidence} confidence
                                        </span>
                                      </div>
                                      <p className="text-xs text-gray-700">
                                        {scoreData.reason}
                                      </p>
                                    </div>
                                  )}

                                  {/* Metadata */}
                                  <div className="flex flex-wrap gap-2 text-xs text-gray-500">
                                    {task.due_date && (
                                      <span className={`
                                        ${isOverdueET(task.due_date) ? 'text-red-600 font-medium' : ''}
                                        ${isTodayET(task.due_date) ? 'text-blue-600 font-medium' : ''}
                                      `}>
                                        📅 {new Date(task.due_date).toLocaleDateString('en-US', {
                                          month: 'short',
                                          day: 'numeric'
                                        })}
                                      </span>
                                    )}
                                    {task.project && <span>📁 {task.project}</span>}
                                    {task.delegated_to && <span>👤 {task.delegated_to}</span>}
                                    {task.goal_id && (
                                      <span>
                                        🎯 {goals.find(g => g.id === task.goal_id)?.title || 'Goal'}
                                      </span>
                                    )}
                                  </div>

                                  {/* Decision indicator */}
                                  {decision && (
                                    <div className={`mt-2 text-xs font-semibold ${
                                      decision === 'accept' ? 'text-green-700' : 'text-red-700'
                                    }`}>
                                      {decision === 'accept' ? '✓ Accepted for Top 10' : '✗ Rejected'}
                                    </div>
                                  )}
                                </div>

                                {/* Action Buttons */}
                                <div className="flex-shrink-0">
                                  {priorityMode && !decision ? (
                                    <div className="flex gap-1">
                                      <button
                                        onClick={() => handlePriorityDecision(task.id, 'accept')}
                                        className="px-3 py-1 text-xs bg-green-600 hover:bg-green-700 text-white rounded font-medium transition-colors"
                                        title="Accept for Top 10"
                                      >
                                        ✓
                                      </button>
                                      <button
                                        onClick={() => setShowReasonModal(scoreData)}
                                        className="px-3 py-1 text-xs bg-red-600 hover:bg-red-700 text-white rounded font-medium transition-colors"
                                        title="Reject"
                                      >
                                        ✗
                                      </button>
                                      <button
                                        onClick={() => alert(`Alfred's Reasoning:\n\n${scoreData.reason}\n\n${scoreData.risk_if_ignored ? 'Risk if ignored: ' + scoreData.risk_if_ignored : ''}`)}
                                        className="px-3 py-1 text-xs border border-gray-300 hover:bg-gray-50 rounded font-medium transition-colors"
                                        title="Why?"
                                      >
                                        💡
                                      </button>
                                    </div>
                                  ) : !priorityMode && !selectionMode ? (
                                    <div className="flex gap-1">
                                      <button
                                        onClick={() => {
                                          setEditingTask(task);
                                          setShowTaskModal(true);
                                        }}
                                        className="px-2 py-1 text-gray-600 hover:bg-gray-100 rounded text-sm"
                                      >
                                        ✏️
                                      </button>
                                      <button
                                        onClick={() => deleteTask(task.id)}
                                        className="px-2 py-1 text-gray-600 hover:bg-red-50 rounded text-sm"
                                      >
                                        🗑️
                                      </button>
                                    </div>
                                  ) : null}
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </Draggable>
                    );
                  })}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>
        )}
      </div>

      {/* Task Modal */}
      {showTaskModal && (
        <TaskModal
          task={editingTask}
          goals={goals}
          projects={projects}
          delegates={delegates}
          onSave={saveTask}
          onClose={() => {
            setShowTaskModal(false);
            setEditingTask(null);
          }}
        />
      )}

      {/* Bulk Action Modal */}
      {showBulkActionModal && (
        <BulkActionModal
          selectedCount={selectedTasks.length}
          delegates={delegates}
          goals={getSortedGoals(goals)}
          onApply={applyBulkAction}
          onCancel={() => setShowBulkActionModal(false)}
        />
      )}

      {/* Reason Modal for Rejecting */}
      {showReasonModal && (
        <ReasonModal
          task={showReasonModal}
          onSubmit={(reason) => handlePriorityDecision(showReasonModal.task_id, 'reject', reason)}
          onClose={() => setShowReasonModal(null)}
        />
      )}
    </div>
  );
}

// Task Modal Component
function TaskModal({ task, goals, projects, delegates, onSave, onClose }) {
  const isEditing = !!task;
  
  const [formData, setFormData] = useState({
    title: task?.title || '',
    notes: task?.notes || '',
    due_date: task?.due_date?.split('T')[0] || '',
    priority: task?.priority?.toLowerCase() || 'medium',
    project: task?.project || '',
    delegated_to: task?.delegated_to || '',
    goal_id: task?.goal_id || ''
  });

  const [showDatePicker, setShowDatePicker] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.title.trim()) {
      alert('Task title is required');
      return;
    }
    
    const submitData = { ...formData };
    if (submitData.goal_id) {
      submitData.goal_id = parseInt(submitData.goal_id);
    } else {
      delete submitData.goal_id;
    }
    
    onSave(submitData);
  };

  const setToday = () => {
    setFormData({ ...formData, due_date: getTodayET() });
    setShowDatePicker(false);
  };

  const setTomorrow = () => {
    const tomorrow = getETDate();
    tomorrow.setDate(tomorrow.getDate() + 1);
    setFormData({ ...formData, due_date: tomorrow.toISOString().split('T')[0] });
    setShowDatePicker(false);
  };

  const setNextMonday = () => {
    setFormData({ ...formData, due_date: getNextMonday() });
    setShowDatePicker(false);
  };

  const setNextMonth = () => {
    const nextMonth = getETDate();
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    setFormData({ ...formData, due_date: nextMonth.toISOString().split('T')[0] });
    setShowDatePicker(false);
  };

  return (
    <>
      <div 
        className="fixed inset-0 bg-black bg-opacity-50 z-40"
        onClick={onClose}
      />
      
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto">
          <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
            <h2 className="text-xl font-semibold text-slate-800">
              {isEditing ? 'Edit Task' : 'New Task'}
            </h2>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 text-2xl leading-none"
            >
              ×
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Task Title *
              </label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="What needs to be done?"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Notes
              </label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Additional context or details..."
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Due Date
              </label>
              <div className="relative">
                <div 
                  onClick={() => setShowDatePicker(!showDatePicker)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white cursor-pointer hover:border-blue-400 transition-colors flex items-center justify-between"
                >
                  <span className={formData.due_date ? 'text-slate-800' : 'text-slate-400'}>
                    {formData.due_date ? new Date(formData.due_date).toLocaleDateString('en-US', { 
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
                        type="button"
                        onClick={setToday}
                        className="w-full text-left px-3 py-2 hover:bg-slate-50 rounded text-sm text-slate-700"
                      >
                        📅 Today
                      </button>
                      <button
                        type="button"
                        onClick={setTomorrow}
                        className="w-full text-left px-3 py-2 hover:bg-slate-50 rounded text-sm text-slate-700"
                      >
                        🗓️ Tomorrow
                      </button>
                      <button
                        type="button"
                        onClick={setNextMonday}
                        className="w-full text-left px-3 py-2 hover:bg-slate-50 rounded text-sm text-slate-700"
                      >
                        📆 Next Monday
                      </button>
                      <button
                        type="button"
                        onClick={setNextMonth}
                        className="w-full text-left px-3 py-2 hover:bg-slate-50 rounded text-sm text-slate-700"
                      >
                        🗓️ Next Month
                      </button>
                    </div>

                    <div className="border-t border-gray-200 p-2">
                      <input
                        type="date"
                        value={formData.due_date}
                        onChange={(e) => {
                          setFormData({ ...formData, due_date: e.target.value });
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
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Priority
              </label>
              <select
                value={formData.priority}
                onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="high">🔴 High Priority</option>
                <option value="medium">🟠 Medium Priority</option>
                <option value="low">🟢 Low Priority</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Project
              </label>
              <input
                type="text"
                value={formData.project}
                onChange={(e) => setFormData({ ...formData, project: e.target.value })}
                list="project-list"
                placeholder="Project name..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <datalist id="project-list">
                {projects.map(p => <option key={p} value={p} />)}
              </datalist>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Delegate To
              </label>
              <input
                type="text"
                value={formData.delegated_to}
                onChange={(e) => setFormData({ ...formData, delegated_to: e.target.value })}
                list="delegate-list"
                placeholder="Person's name..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <datalist id="delegate-list">
                {delegates.map(d => <option key={d} value={d} />)}
              </datalist>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Link to Goal
              </label>
              <select
                value={formData.goal_id}
                onChange={(e) => setFormData({ ...formData, goal_id: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="">No goal</option>
                {getSortedGoals(goals).map(g => {
                  const displayText = g.title || g.goal_text;
                  const truncatedText = displayText.length > 50 ? displayText.substring(0, 50) + '...' : displayText;
                  const indentation = getGoalIndentation(g.time_horizon);
                  return <option key={g.id} value={g.id}>{indentation}{truncatedText}</option>;
                })}
              </select>
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-lg font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
              >
                {isEditing ? 'Save Changes' : 'Add Task'}
              </button>
            </div>
          </form>
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
    const tomorrow = getETDate();
    tomorrow.setDate(tomorrow.getDate() + 1);
    setBulkData({ ...bulkData, due_date: tomorrow.toISOString().split('T')[0] });
    setShowDatePicker(false);
  };

  const setNextMonday = () => {
    setBulkData({ ...bulkData, due_date: getNextMonday() });
    setShowDatePicker(false);
  };

  const setNextMonth = () => {
    const nextMonth = getETDate();
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

// Reason Modal for rejecting priority recommendations
function ReasonModal({ task, onSubmit, onClose }) {
  const [reason, setReason] = useState('');
  
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg p-6 max-w-md w-full shadow-2xl">
        <h3 className="text-xl font-semibold mb-2 text-gray-800">
          Why reject this task?
        </h3>
        <p className="text-sm font-medium text-gray-700 mb-3">
          {task.title}
        </p>
        <p className="text-sm text-gray-600 mb-4">
          Your feedback helps Alfred learn your priorities. This is optional but valuable for improving recommendations.
        </p>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="E.g., 'Not strategic right now', 'Need to focus on revenue first', 'Can delegate this'..."
          className="w-full p-3 border border-gray-300 rounded-lg mb-4 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          rows={4}
          autoFocus
        />
        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={() => onSubmit(reason.trim() || null)}
            className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium"
          >
            {reason.trim() ? 'Reject with Feedback' : 'Reject'}
          </button>
        </div>
      </div>
    </div>
  );
}
