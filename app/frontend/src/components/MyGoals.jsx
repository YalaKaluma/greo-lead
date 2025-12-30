import { useState, useEffect } from 'react';
import axios from 'axios';

// Create axios instance with proper base URL
const createApiClient = (apiUrl) => {
  return axios.create({
    baseURL: apiUrl || '', // Empty string = relative URLs
    headers: {
      'Content-Type': 'application/json'
    }
  });
};

export default function MyGoals({ apiUrl = '', userNumber }) {
  const [goals, setGoals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingGoalId, setEditingGoalId] = useState(null);
  const [timeFilter, setTimeFilter] = useState('long');
  const [hierarchicalView, setHierarchicalView] = useState(null);
  const [draggedGoal, setDraggedGoal] = useState(null);
  const [taskCounts, setTaskCounts] = useState({});

  // Create API client
  const api = createApiClient(apiUrl);

  useEffect(() => {
    fetchGoals();
    fetchTaskCounts();
  }, []);

  const fetchGoals = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get('/api/journey/goals', {
        params: { user_number: userNumber }
      });
      if (response.data && Array.isArray(response.data)) {
        const sorted = response.data.sort((a, b) => {
          const order = { long: 1, medium: 2, short: 3 };
          return (order[a.time_horizon] || 2) - (order[b.time_horizon] || 2);
        });
        setGoals(sorted);
      }
    } catch (err) {
      console.error('Error fetching goals:', err);
      if (err.response?.status === 404) {
        setError('Journey goals endpoint not implemented yet');
      } else {
        setError('Failed to load goals');
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchTaskCounts = async () => {
    try {
      const response = await api.get('/api/tasks', {
        params: { user_number: userNumber }
      });
      if (response.data && Array.isArray(response.data)) {
        const counts = {};
        response.data.forEach(task => {
          if (task.goal_id) {
            counts[task.goal_id] = (counts[task.goal_id] || 0) + 1;
          }
        });
        setTaskCounts(counts);
      }
    } catch (err) {
      console.error('Error fetching task counts:', err);
    }
  };

  const addGoal = async (goalData) => {
    try {
      await api.post('/api/journey/goals', goalData, {
        params: { user_number: userNumber }
      });
      await fetchGoals();
      setShowAddForm(false);
    } catch (err) {
      console.error('Error adding goal:', err);
      alert('Failed to add goal');
    }
  };

  const updateGoal = async (goalId, updates) => {
    try {
      await api.put(`/api/journey/goals/${goalId}`, updates, {
        params: { user_number: userNumber }
      });
      await fetchGoals();
      setEditingGoalId(null);
    } catch (err) {
      console.error('Error updating goal:', err);
      alert('Failed to update goal');
    }
  };

  const deleteGoal = async (goalId) => {
    if (!confirm('Delete this goal?')) return;
    
    try {
      await api.delete(`/api/journey/goals/${goalId}`, {
        params: { user_number: userNumber }
      });
      setGoals(goals.filter(g => g.id !== goalId));
    } catch (err) {
      console.error('Error deleting goal:', err);
      alert('Failed to delete goal');
    }
  };

  const updateGoalOrder = async (goalId, newSortOrder) => {
    try {
      await api.put(`/api/journey/goals/${goalId}`, { sort_order: newSortOrder }, {
        params: { user_number: userNumber }
      });
    } catch (err) {
      console.error('Error updating goal order:', err);
    }
  };

  // Handle drag and drop
  const handleDragStart = (e, goal) => {
    setDraggedGoal(goal);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = async (e, targetGoal) => {
    e.preventDefault();
    
    if (!draggedGoal || draggedGoal.id === targetGoal.id) {
      setDraggedGoal(null);
      return;
    }

    // Only allow reordering within the same parent and time horizon
    if (draggedGoal.parent_goal_id !== targetGoal.parent_goal_id || 
        draggedGoal.time_horizon !== targetGoal.time_horizon) {
      setDraggedGoal(null);
      return;
    }

    // Get goals in the same group
    const sameGroupGoals = goals.filter(g => 
      g.time_horizon === draggedGoal.time_horizon &&
      g.parent_goal_id === draggedGoal.parent_goal_id
    );

    // Reorder the array
    const draggedIndex = sameGroupGoals.findIndex(g => g.id === draggedGoal.id);
    const targetIndex = sameGroupGoals.findIndex(g => g.id === targetGoal.id);
    
    const reordered = [...sameGroupGoals];
    const [movedItem] = reordered.splice(draggedIndex, 1);
    reordered.splice(targetIndex, 0, movedItem);

    // Update sort_order for all affected goals
    const updates = reordered.map((goal, index) => ({
      id: goal.id,
      sort_order: index
    }));

    // Optimistically update UI
    const newGoals = goals.map(g => {
      const update = updates.find(u => u.id === g.id);
      return update ? { ...g, sort_order: update.sort_order } : g;
    });
    setGoals(newGoals);

    // Send updates to backend
    for (const update of updates) {
      await updateGoalOrder(update.id, update.sort_order);
    }

    setDraggedGoal(null);
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleDateString('en-US', { 
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const getTimeHorizonBadge = (horizon) => {
    const colors = {
      short: 'bg-slate-100 text-slate-800',
      medium: 'bg-slate-100 text-slate-800',
      long: 'bg-slate-100 text-slate-800'
    };
    return colors[horizon] || 'bg-slate-100 text-slate-800';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto p-6">
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg">
          {error}
        </div>
      </div>
    );
  }

  // Get the selected goal and its children for hierarchical view
  const selectedGoal = hierarchicalView ? goals.find(g => g.id === hierarchicalView) : null;
  const mediumChildren = selectedGoal ? goals.filter(g => 
    g.parent_goal_id === selectedGoal.id && g.time_horizon === 'medium'
  ) : [];
  const shortChildren = (goalId) => goals.filter(g => 
    g.parent_goal_id === goalId && g.time_horizon === 'short'
  );

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6">
      {/* Header */}
      <div className="mb-6 sm:mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-800">My Vision and Goals</h1>
          <p className="text-sm sm:text-base text-slate-600 mt-1">Define your true North</p>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-3 sm:px-4 py-2 rounded-lg font-medium transition-colors text-sm sm:text-base"
        >
          <span className="hidden sm:inline">+ Add Goal</span>
          <span className="sm:hidden">+</span>
        </button>
      </div>

      {/* Add Goal Form */}
      {showAddForm && (
        <div className="mb-6">
          <GoalForm
            goals={goals}
            onSubmit={addGoal}
            onCancel={() => setShowAddForm(false)}
          />
        </div>
      )}

      {/* Time Filter Buttons */}
      {!hierarchicalView && (
        <div className="mb-6 flex gap-2">
          <button
            onClick={() => setTimeFilter('long')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              timeFilter === 'long'
                ? 'bg-slate-800 text-white'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            Long Term
          </button>
          <button
            onClick={() => setTimeFilter('medium')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              timeFilter === 'medium'
                ? 'bg-slate-800 text-white'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            Medium Term
          </button>
          <button
            onClick={() => setTimeFilter('short')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              timeFilter === 'short'
                ? 'bg-slate-800 text-white'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            Short Term
          </button>
        </div>
      )}

      {/* Hierarchical Tree View */}
      {hierarchicalView && selectedGoal && (
        <div className="mb-4">
          <button
            onClick={() => setHierarchicalView(null)}
            className="flex items-center gap-2 text-blue-600 hover:text-blue-700 font-medium mb-4"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Overview
          </button>

          <div className="space-y-4">
            {/* Long Term Goal - Full Width */}
            <div className="bg-gradient-to-r from-purple-50 to-pink-50 border-2 border-purple-200 rounded-lg p-4 sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-2xl">🎯</span>
                    <h2 className="text-xl sm:text-2xl font-bold text-slate-800">
                      {selectedGoal.title || selectedGoal.goal_text}
                    </h2>
                  </div>
                  {selectedGoal.title && selectedGoal.goal_text !== selectedGoal.title && (
                    <p className="text-slate-600 mb-3 ml-10">
                      {selectedGoal.goal_text}
                    </p>
                  )}
                  {selectedGoal.why && (
                    <div className="ml-10">
                      <span className="text-sm font-medium text-purple-700">Why: </span>
                      <span className="text-sm text-slate-600">{selectedGoal.why}</span>
                    </div>
                  )}
                </div>
                <button
                  onClick={() => setEditingGoalId(selectedGoal.id)}
                  className="text-slate-400 hover:text-slate-600 text-xl"
                >
                  ✏️
                </button>
              </div>
            </div>

            {/* Medium Term Goals - Side by Side */}
            {mediumChildren.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold text-slate-700 mb-3 ml-8">Medium Term Goals</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 ml-8">
                  {mediumChildren.map(medGoal => (
                    <div
                      key={medGoal.id}
                      className="bg-gradient-to-br from-blue-50 to-cyan-50 border-2 border-blue-200 rounded-lg p-4"
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2 flex-1">
                          <span className="text-xl">🚀</span>
                          <h4 className="font-bold text-slate-800 text-sm sm:text-base">
                            {medGoal.title || medGoal.goal_text}
                          </h4>
                        </div>
                        <button
                          onClick={() => setEditingGoalId(medGoal.id)}
                          className="text-slate-400 hover:text-slate-600 text-sm"
                        >
                          ✏️
                        </button>
                      </div>
                      {medGoal.title && medGoal.goal_text !== medGoal.title && (
                        <p className="text-xs text-slate-600 mb-2 ml-7">
                          {medGoal.goal_text}
                        </p>
                      )}
                      {medGoal.why && (
                        <p className="text-xs text-slate-500 ml-7 italic">
                          {medGoal.why}
                        </p>
                      )}

                      {/* Short Term Goals underneath this medium goal */}
                      {shortChildren(medGoal.id).length > 0 && (
                        <div className="mt-4 space-y-2 ml-4 border-l-2 border-slate-200 pl-3">
                          {shortChildren(medGoal.id).map(shortGoal => (
                            <div
                              key={shortGoal.id}
                              className="bg-white border border-slate-200 rounded p-3 text-sm"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex items-center gap-2 flex-1">
                                  <span className="text-base">⚡</span>
                                  <span className="font-medium text-slate-800 text-xs sm:text-sm">
                                    {shortGoal.title || shortGoal.goal_text}
                                  </span>
                                </div>
                                <button
                                  onClick={() => setEditingGoalId(shortGoal.id)}
                                  className="text-slate-400 hover:text-slate-600 text-xs"
                                >
                                  ✏️
                                </button>
                              </div>
                              {shortGoal.title && shortGoal.goal_text !== shortGoal.title && (
                                <p className="text-xs text-slate-500 mt-1 ml-6">
                                  {shortGoal.goal_text}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Orphaned Short Term Goals (no medium parent) */}
            {shortChildren(selectedGoal.id).length > 0 && (
              <div className="ml-8">
                <h3 className="text-lg font-semibold text-slate-700 mb-3">Short Term Goals</h3>
                <div className="space-y-2">
                  {shortChildren(selectedGoal.id).map(shortGoal => (
                    <div
                      key={shortGoal.id}
                      className="bg-white border border-slate-200 rounded-lg p-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 flex-1">
                          <span className="text-lg">⚡</span>
                          <span className="font-medium text-slate-800">
                            {shortGoal.title || shortGoal.goal_text}
                          </span>
                        </div>
                        <button
                          onClick={() => setEditingGoalId(shortGoal.id)}
                          className="text-slate-400 hover:text-slate-600 text-sm"
                        >
                          ✏️
                        </button>
                      </div>
                      {shortGoal.title && shortGoal.goal_text !== shortGoal.title && (
                        <p className="text-sm text-slate-600 mt-2 ml-7">
                          {shortGoal.goal_text}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Regular Grid View */}
      {!hierarchicalView && (() => {
        const filteredGoals = goals.filter(g => 
          g.time_horizon === timeFilter && !g.parent_goal_id
        );

        if (filteredGoals.length === 0) {
          return (
            <div className="text-center py-12 text-slate-500">
              No {timeFilter} term goals yet. Share your goals with Alfred to see them here!
            </div>
          );
        }

        // For editing mode
        if (editingGoalId) {
          const editingGoal = goals.find(g => g.id === editingGoalId);
          if (editingGoal) {
            return (
              <GoalForm
                goal={editingGoal}
                goals={goals}
                onSubmit={(data) => updateGoal(editingGoal.id, data)}
                onCancel={() => setEditingGoalId(null)}
                onDelete={() => deleteGoal(editingGoal.id)}
              />
            );
          }
        }

        // For Long Term: Regular grid with compact cards for mobile
        return (
          <div className="grid gap-3 sm:gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredGoals.map((goal) => (
              <div
                key={goal.id}
                draggable
                onDragStart={(e) => handleDragStart(e, goal)}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, goal)}
                className={`bg-white border border-gray-200 rounded-lg p-3 sm:p-4 shadow-sm hover:shadow-md transition-all cursor-move ${
                  draggedGoal?.id === goal.id ? 'opacity-50 scale-98' : ''
                }`}
              >
                <div onClick={() => setEditingGoalId(goal.id)} className="cursor-pointer">
                  <div className="flex items-start gap-2 mb-2">
                    <span className="text-slate-400 text-xs sm:text-sm mt-0.5">⋮⋮</span>
                    <h3 className="text-base sm:text-lg font-bold text-slate-800 flex-1 leading-tight">
                      {goal.title || goal.goal_text}
                    </h3>
                  </div>
                  
                  {goal.title && goal.goal_text !== goal.title && (
                    <p className="text-slate-600 mb-2 text-xs sm:text-sm ml-5 sm:ml-6 line-clamp-2">
                      {goal.goal_text}
                    </p>
                  )}

                  {goal.why && (
                    <div className="mb-2 ml-5 sm:ml-6">
                      <span className="text-xs font-medium text-slate-600">Why: </span>
                      <span className="text-xs text-slate-600 line-clamp-2">{goal.why}</span>
                    </div>
                  )}
                </div>

                <div className="mt-2 sm:mt-3 flex gap-3 sm:gap-4 items-center justify-end text-slate-400">
                  <a
                    href={`/?page=todo-list&goal=${goal.id}`}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      window.location.href = `/?page=todo-list&goal=${goal.id}`;
                    }}
                    className="hover:text-blue-600 transition-colors cursor-pointer text-xl sm:text-2xl relative"
                    title="View tasks"
                  >
                    📋
                    {taskCounts[goal.id] > 0 && (
                      <span className="absolute -top-1 -right-1 bg-blue-900 text-white text-xs w-4 h-4 rounded-full flex items-center justify-center" style={{ fontSize: '10px' }}>
                        {taskCounts[goal.id]}
                      </span>
                    )}
                  </a>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setHierarchicalView(goal.id);
                    }}
                    className="hover:text-blue-700 transition-colors relative text-xl sm:text-2xl"
                    title="View sub-goals"
                  >
                    <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 013.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                    </svg>
                    {goals.filter(g => g.parent_goal_id === goal.id).length > 0 && (
                      <span className="absolute -top-1 -right-1 bg-blue-900 text-white text-xs w-4 h-4 rounded-full flex items-center justify-center" style={{ fontSize: '10px' }}>
                        {goals.filter(g => g.parent_goal_id === goal.id).length}
                      </span>
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        );
      })()}
    </div>
  );
}

// Goal Form Component
function GoalForm({ goal, goals, onSubmit, onCancel, onDelete }) {
  const [formData, setFormData] = useState({
    title: goal?.title || '',
    goal_text: goal?.goal_text || '',
    why: goal?.why || '',
    time_horizon: goal?.time_horizon || 'medium',
    parent_goal_id: goal?.parent_goal_id || null
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.goal_text.trim()) {
      alert('Please enter a goal description');
      return;
    }
    onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="bg-blue-50 border-2 border-blue-200 rounded-lg p-4 space-y-3">
      <h3 className="font-semibold text-slate-800">{goal ? 'Edit Goal' : 'Add New Goal'}</h3>
      
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">
          Title (short, for sidebar)
        </label>
        <input
          type="text"
          value={formData.title}
          onChange={(e) => setFormData({ ...formData, title: e.target.value })}
          placeholder="e.g., Complete MBA, Launch Product, etc."
          maxLength={50}
          className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <p className="text-xs text-slate-500 mt-1">Optional - appears in sidebar (max 50 chars)</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">
          Full Description *
        </label>
        <textarea
          value={formData.goal_text}
          onChange={(e) => setFormData({ ...formData, goal_text: e.target.value })}
          placeholder="What is your goal?"
          rows={3}
          className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">
          Why is this important?
        </label>
        <textarea
          value={formData.why}
          onChange={(e) => setFormData({ ...formData, why: e.target.value })}
          placeholder="Why is this important to you?"
          rows={2}
          className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">
          Time Horizon
        </label>
        <select
          value={formData.time_horizon}
          onChange={(e) => setFormData({ ...formData, time_horizon: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="short">Short Term</option>
          <option value="medium">Medium Term</option>
          <option value="long">Long Term</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">
          Parent Goal (optional)
        </label>
        <select
          value={formData.parent_goal_id || ''}
          onChange={(e) => setFormData({ ...formData, parent_goal_id: e.target.value ? parseInt(e.target.value) : null })}
          className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">None (Top-level goal)</option>
          {goals && goals.filter(g => g.id !== goal?.id).map(g => (
            <option key={g.id} value={g.id}>
              {g.title || g.goal_text.substring(0, 50)}
            </option>
          ))}
        </select>
        <p className="text-xs text-slate-500 mt-1">
          Select a parent goal to break this into sub-goals
        </p>
      </div>

      <div className="flex gap-2">
        <button
          type="submit"
          className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded font-medium"
        >
          Save
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2 rounded font-medium"
        >
          Cancel
        </button>
        {goal && onDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded font-medium"
          >
            Delete
          </button>
        )}
      </div>
    </form>
  );
}