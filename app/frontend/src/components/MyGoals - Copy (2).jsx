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

  // Create API client
  const api = createApiClient(apiUrl);

  useEffect(() => {
    fetchGoals();
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
      short: 'bg-blue-100 text-blue-800',
      medium: 'bg-purple-100 text-purple-800',
      long: 'bg-green-100 text-green-800'
    };
    return colors[horizon] || colors.medium;
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

  return (
    <div className="max-w-7xl mx-auto p-6">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-800">My Goals</h1>
          <p className="text-slate-600 mt-1">Your aspirations and objectives</p>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
        >
          + Add Goal
        </button>
      </div>

      {/* Add Goal Form */}
      {showAddForm && (
        <GoalForm
          goals={goals}
          onSubmit={addGoal}
          onCancel={() => setShowAddForm(false)}
        />
      )}

      {/* Time Horizon Filter */}
      <div className="mb-6 flex gap-3">
        <button
          onClick={() => setTimeFilter('long')}
          className={`px-6 py-3 rounded-lg font-medium transition-all ${
            timeFilter === 'long'
              ? 'bg-green-600 text-white shadow-lg scale-105'
              : 'bg-white text-slate-700 border border-gray-300 hover:bg-gray-50'
          }`}
        >
          Long Term
        </button>
        <button
          onClick={() => setTimeFilter('medium')}
          className={`px-6 py-3 rounded-lg font-medium transition-all ${
            timeFilter === 'medium'
              ? 'bg-purple-600 text-white shadow-lg scale-105'
              : 'bg-white text-slate-700 border border-gray-300 hover:bg-gray-50'
          }`}
        >
          Medium Term
        </button>
        <button
          onClick={() => setTimeFilter('short')}
          className={`px-6 py-3 rounded-lg font-medium transition-all ${
            timeFilter === 'short'
              ? 'bg-blue-600 text-white shadow-lg scale-105'
              : 'bg-white text-slate-700 border border-gray-300 hover:bg-gray-50'
          }`}
        >
          Short Term
        </button>
      </div>

      {/* Hierarchical View Header */}
      {hierarchicalView && (
        <div className="mb-4 bg-green-50 border border-green-200 rounded-lg p-4 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-green-800">
              🌳 Hierarchical View: {goals.find(g => g.id === hierarchicalView)?.title || goals.find(g => g.id === hierarchicalView)?.goal_text}
            </h3>
            <p className="text-sm text-green-700">
              Showing parent goal and its sub-goals only
            </p>
          </div>
          <button
            onClick={() => setHierarchicalView(null)}
            className="px-4 py-2 bg-white hover:bg-gray-100 text-slate-700 border border-gray-300 rounded-lg text-sm font-medium"
          >
            ✕ Exit Hierarchy
          </button>
        </div>
      )}

      {/* Goals Grid */}
      {(() => {
        let filteredGoals;
        let parentGoal = null;
        let childGoals = [];
        
        if (hierarchicalView) {
          parentGoal = goals.find(g => g.id === hierarchicalView);
          childGoals = goals.filter(g => g.parent_goal_id === hierarchicalView);
          filteredGoals = [];
        } else {
          filteredGoals = goals.filter(g => g.time_horizon === timeFilter);
        }

        if (hierarchicalView && parentGoal) {
          return (
            <div className="space-y-4">
              {/* Parent Goal */}
              <div className="bg-white border-2 border-green-500 rounded-lg p-5 shadow-md">
                <div className="flex items-start justify-between">
                  <div className="flex-1" onClick={() => setEditingGoalId(parentGoal.id)} style={{ cursor: 'pointer' }}>
                    <h3 className="text-2xl font-bold text-slate-800 mb-2">
                      🎯 {parentGoal.title || parentGoal.goal_text}
                    </h3>
                    {parentGoal.title && parentGoal.goal_text !== parentGoal.title && (
                      <p className="text-slate-600 mb-2">{parentGoal.goal_text}</p>
                    )}
                    {parentGoal.why && (
                      <div className="mb-2">
                        <span className="text-sm font-medium text-slate-600">Why: </span>
                        <span className="text-sm text-slate-600">{parentGoal.why}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Child Goals */}
              {childGoals.length > 0 && (
                <div className="ml-8 space-y-3">
                  <h4 className="text-lg font-semibold text-slate-700">Sub-goals:</h4>
                  {childGoals.map((goal) => (
                    <div key={goal.id} className="bg-white border-l-4 border-green-400 rounded-lg p-4 shadow-sm">
                      <div onClick={() => setEditingGoalId(goal.id)} className="cursor-pointer">
                        <h5 className="text-lg font-semibold text-slate-800">
                          {goal.title || goal.goal_text}
                        </h5>
                        {goal.title && goal.goal_text !== goal.title && (
                          <p className="text-slate-600 text-sm mt-1">{goal.goal_text}</p>
                        )}
                        {goal.why && (
                          <div className="mt-2">
                            <span className="text-xs font-medium text-slate-600">Why: </span>
                            <span className="text-xs text-slate-600">{goal.why}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {childGoals.length === 0 && (
                <div className="ml-8 text-slate-500 italic">
                  No sub-goals yet. Break this goal into smaller steps!
                </div>
              )}
            </div>
          );
        }

        return filteredGoals.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-slate-600 text-lg">
              No {timeFilter} term goals yet. Add one to get started!
            </p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredGoals.map((goal) => (
            editingGoalId === goal.id ? (
              <GoalForm
                key={goal.id}
                goal={goal}
                goals={goals}
                onSubmit={(data) => updateGoal(goal.id, data)}
                onCancel={() => setEditingGoalId(null)}
                onDelete={() => deleteGoal(goal.id)}
              />
            ) : (
              <div
                key={goal.id}
                className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm hover:shadow-md transition-shadow"
              >
                <div onClick={() => setEditingGoalId(goal.id)} className="cursor-pointer">
                  <h3 className="text-xl font-bold text-slate-800 mb-3">
                    {goal.title || goal.goal_text}
                  </h3>
                  
                  {goal.title && goal.goal_text !== goal.title && (
                    <p className="text-slate-600 mb-3 text-sm">
                      {goal.goal_text}
                    </p>
                  )}

                  {goal.why && (
                    <div className="mb-3">
                      <span className="text-sm font-medium text-slate-600">Why: </span>
                      <span className="text-sm text-slate-600">{goal.why}</span>
                    </div>
                  )}
                </div>

                <div className="mt-3 flex gap-4 items-center justify-end text-slate-400">
                  <a
                    href={`/?page=todo-list&goal=${goal.id}`}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      window.location.href = `/?page=todo-list&goal=${goal.id}`;
                    }}
                    className="hover:text-blue-600 transition-colors cursor-pointer text-2xl"
                    title="View tasks"
                  >
                    📋
                  </a>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setHierarchicalView(goal.id);
                    }}
                    className="hover:text-green-600 transition-colors relative text-2xl"
                    title="View sub-goals"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 013.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                    </svg>
                    {goals.filter(g => g.parent_goal_id === goal.id).length > 0 && (
                      <span className="absolute -top-1 -right-1 bg-green-600 text-white text-xs w-4 h-4 rounded-full flex items-center justify-center" style={{ fontSize: '10px' }}>
                        {goals.filter(g => g.parent_goal_id === goal.id).length}
                      </span>
                    )}
                  </button>
                </div>
              </div>
            )
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
