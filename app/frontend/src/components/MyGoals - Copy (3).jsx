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
              ? 'bg-slate-800 text-white shadow-md'
              : 'bg-white text-slate-700 border border-gray-300 hover:bg-gray-50'
          }`}
        >
          Long Term
        </button>
        <button
          onClick={() => setTimeFilter('medium')}
          className={`px-6 py-3 rounded-lg font-medium transition-all ${
            timeFilter === 'medium'
              ? 'bg-slate-800 text-white shadow-md'
              : 'bg-white text-slate-700 border border-gray-300 hover:bg-gray-50'
          }`}
        >
          Medium Term
        </button>
        <button
          onClick={() => setTimeFilter('short')}
          className={`px-6 py-3 rounded-lg font-medium transition-all ${
            timeFilter === 'short'
              ? 'bg-slate-800 text-white shadow-md'
              : 'bg-white text-slate-700 border border-gray-300 hover:bg-gray-50'
          }`}
        >
          Short Term
        </button>
      </div>

      {/* Hierarchical View Header */}
      {hierarchicalView && (
        <div className="mb-4 bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-blue-900">
               Hierarchical View: {goals.find(g => g.id === hierarchicalView)?.title || goals.find(g => g.id === hierarchicalView)?.goal_text}
            </h3>
            <p className="text-sm text-blue-800">
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
          childGoals = goals.filter(g => g.parent_goal_id === hierarchicalView)
            .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
          filteredGoals = [];
        } else {
          filteredGoals = goals.filter(g => g.time_horizon === timeFilter);

          // If viewing Medium Term goals, group/sort them by the Long Term goal they roll up to.
          // (Medium goals with no Long Term parent appear last.)
          if (timeFilter === 'medium') {
            const getLongTermParentLabel = (g) => {
              let current = g;
              let safety = 0;

              while (current?.parent_goal_id && safety < 25) {
                safety++;
                const parent = goals.find(p => p.id === current.parent_goal_id);
                if (!parent) break;
                current = parent;
                if (current.time_horizon === 'long') return current.title || current.goal_text;
              }
              return null;
            };

            filteredGoals = filteredGoals.slice().sort((a, b) => {
              const aLongTerm = getLongTermParentLabel(a);
              const bLongTerm = getLongTermParentLabel(b);

              if (aLongTerm && !bLongTerm) return -1;
              if (!aLongTerm && bLongTerm) return 1;
              if (!aLongTerm && !bLongTerm) return (a.sort_order || 0) - (b.sort_order || 0);

              const cmp = (aLongTerm || '').localeCompare(bLongTerm || '');
              return cmp !== 0 ? cmp : (a.sort_order || 0) - (b.sort_order || 0);
            });
          } else {
            // For long/short term, just sort by sort_order
            filteredGoals.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
          }
        }

        if (hierarchicalView && parentGoal) {
          return (
            <div className="space-y-4">
              {/* Parent Goal Card */}
              <div className="bg-blue-100 border-2 border-blue-300 rounded-lg p-5 shadow-md">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm font-semibold text-blue-900 bg-blue-200 px-2 py-1 rounded">
                        Parent Goal
                      </span>
                      <span className={`text-sm px-3 py-1 rounded-full ${getTimeHorizonBadge(parentGoal.time_horizon)}`}>
                        {parentGoal.time_horizon}
                      </span>
                    </div>
                    <h3 className="text-xl font-bold text-slate-800 mb-2">
                      {parentGoal.title || parentGoal.goal_text}
                    </h3>
                    {parentGoal.title && parentGoal.goal_text !== parentGoal.title && (
                      <p className="text-slate-600 mb-2 text-sm">
                        {parentGoal.goal_text}
                      </p>
                    )}
                    {parentGoal.why && (
                      <div className="mb-2">
                        <span className="text-sm font-medium text-slate-600">Why: </span>
                        <span className="text-sm text-slate-600">{parentGoal.why}</span>
                      </div>
                    )}
                  </div>
                  
                  <div className="flex gap-2 items-center text-slate-400">
                    <a
                      href={`/?page=todo-list&goal=${parentGoal.id}`}
                      onClick={(e) => {
                        e.preventDefault();
                        window.location.href = `/?page=todo-list&goal=${parentGoal.id}`;
                      }}
                      className="hover:text-blue-600 transition-colors cursor-pointer text-2xl relative"
                      title="View tasks"
                    >
                      📋
                      {taskCounts[parentGoal.id] > 0 && (
                        <span className="absolute -top-1 -right-1 bg-blue-900 text-white text-xs w-4 h-4 rounded-full flex items-center justify-center" style={{ fontSize: '10px' }}>
                          {taskCounts[parentGoal.id]}
                        </span>
                      )}
                    </a>
                  </div>
                </div>
              </div>

              {/* Sub-goals */}
              {childGoals.length > 0 && (
                <div className="ml-8 space-y-3">
                  <h4 className="text-lg font-semibold text-slate-700 mb-3">Sub-goals</h4>
                  {childGoals.map((goal) => (
                    <div
                      key={goal.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, goal)}
                      onDragOver={handleDragOver}
                      onDrop={(e) => handleDrop(e, goal)}
                      className={`bg-white border-l-4 border-blue-400 rounded-lg p-4 shadow-sm hover:shadow-md transition-all cursor-move ${
                        draggedGoal?.id === goal.id ? 'opacity-50 scale-98' : ''
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div 
                          className="flex-1 cursor-pointer"
                          onClick={() => {
                            const hasSubGoals = goals.filter(g => g.parent_goal_id === goal.id).length > 0;
                            if (hasSubGoals) {
                              setHierarchicalView(goal.id);
                            } else {
                              setEditingGoalId(goal.id);
                            }
                          }}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs text-slate-500">⋮⋮</span>
                            <h4 className="font-semibold text-slate-800">
                              {goal.title || goal.goal_text}
                            </h4>
                          </div>
                          {goal.title && goal.goal_text !== goal.title && (
                            <p className="text-slate-600 text-sm mb-1 ml-5">
                              {goal.goal_text}
                            </p>
                          )}
                          {goal.why && (
                            <div className="ml-5">
                              <span className="text-xs text-slate-600">{goal.why}</span>
                            </div>
                          )}
                        </div>

                        <div className="flex gap-3 items-center text-slate-400 ml-4">
                          <a
                            href={`/?page=todo-list&goal=${goal.id}`}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              window.location.href = `/?page=todo-list&goal=${goal.id}`;
                            }}
                            className="hover:text-blue-600 transition-colors cursor-pointer text-xl relative"
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
                            className="hover:text-blue-700 transition-colors relative text-xl"
                            title="View sub-goals"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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

        // Render Medium Term Goals with Grouping
        if (filteredGoals.length === 0) {
          return (
            <div className="text-center py-12">
              <p className="text-slate-600 text-lg">
                No {timeFilter} term goals yet. Add one to get started!
              </p>
            </div>
          );
        }

        // For Medium Term: Group by Long Term parent
        if (timeFilter === 'medium') {
          const getLongTermParent = (g) => {
            let current = g;
            let safety = 0;
            while (current?.parent_goal_id && safety < 25) {
              safety++;
              const parent = goals.find(p => p.id === current.parent_goal_id);
              if (!parent) break;
              current = parent;
              if (current.time_horizon === 'long') return current;
            }
            return null;
          };

          // Group goals by their long-term parent
          const grouped = {};
          filteredGoals.forEach(goal => {
            const parent = getLongTermParent(goal);
            const key = parent ? parent.id : 'no-parent';
            if (!grouped[key]) {
              grouped[key] = {
                parent: parent,
                goals: []
              };
            }
            grouped[key].goals.push(goal);
          });

          // Sort groups: goals with parents first, then no-parent goals
          const sortedGroups = Object.entries(grouped).sort(([keyA, groupA], [keyB, groupB]) => {
            if (groupA.parent && !groupB.parent) return -1;
            if (!groupA.parent && groupB.parent) return 1;
            if (groupA.parent && groupB.parent) {
              return (groupA.parent.title || groupA.parent.goal_text).localeCompare(
                groupB.parent.title || groupB.parent.goal_text
              );
            }
            return 0;
          });

          return (
            <div className="space-y-8">
              {sortedGroups.map(([key, group]) => (
                <div key={key}>
                  {/* Group Header */}
                  {group.parent && (
                    <div className="mb-4 pb-3 border-b-2 border-slate-300">
                      <div className="flex items-center gap-3">
                        <div className="flex-1">
                          <h3 className="text-lg font-bold text-slate-700">
                            🎯 {group.parent.title || group.parent.goal_text}
                          </h3>
                          <p className="text-sm text-slate-500 mt-1">
                            Long-term goal • {group.goals.length} medium-term {group.goals.length === 1 ? 'goal' : 'goals'}
                          </p>
                        </div>
                        <button
                          onClick={() => setHierarchicalView(group.parent.id)}
                          className="text-blue-600 hover:text-blue-700 text-sm font-medium px-3 py-1 rounded border border-blue-300 hover:bg-blue-50 transition-colors"
                        >
                          View Tree →
                        </button>
                      </div>
                    </div>
                  )}
                  {!group.parent && group.goals.length > 0 && (
                    <div className="mb-4 pb-3 border-b-2 border-slate-300">
                      <h3 className="text-lg font-bold text-slate-700">
                        📌 Independent Goals
                      </h3>
                      <p className="text-sm text-slate-500 mt-1">
                        Not linked to a long-term goal
                      </p>
                    </div>
                  )}

                  {/* Goals Grid */}
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {group.goals.map((goal) => (
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
                          draggable
                          onDragStart={(e) => handleDragStart(e, goal)}
                          onDragOver={handleDragOver}
                          onDrop={(e) => handleDrop(e, goal)}
                          className={`bg-white border border-gray-200 rounded-lg p-5 shadow-sm hover:shadow-md transition-all cursor-move ${
                            draggedGoal?.id === goal.id ? 'opacity-50 scale-98' : ''
                          }`}
                        >
                          <div onClick={() => setEditingGoalId(goal.id)} className="cursor-pointer">
                            <div className="flex items-start gap-2 mb-2">
                              <span className="text-slate-400 text-sm mt-1">⋮⋮</span>
                              <h3 className="text-xl font-bold text-slate-800 flex-1">
                                {goal.title || goal.goal_text}
                              </h3>
                            </div>
                            
                            {goal.title && goal.goal_text !== goal.title && (
                              <p className="text-slate-600 mb-3 text-sm ml-6">
                                {goal.goal_text}
                              </p>
                            )}

                            {goal.why && (
                              <div className="mb-3 ml-6">
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
                              className="hover:text-blue-600 transition-colors cursor-pointer text-2xl relative"
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
                              className="hover:text-blue-700 transition-colors relative text-2xl"
                              title="View sub-goals"
                            >
                              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                      )
                    ))}
                  </div>
                </div>
              ))}
            </div>
          );
        }

        // For Long/Short Term: Regular grid
        return (
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
                draggable
                onDragStart={(e) => handleDragStart(e, goal)}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, goal)}
                className={`bg-white border border-gray-200 rounded-lg p-5 shadow-sm hover:shadow-md transition-all cursor-move ${
                  draggedGoal?.id === goal.id ? 'opacity-50 scale-98' : ''
                }`}
              >
                <div onClick={() => setEditingGoalId(goal.id)} className="cursor-pointer">
                  <div className="flex items-start gap-2 mb-2">
                    <span className="text-slate-400 text-sm mt-1">⋮⋮</span>
                    <h3 className="text-xl font-bold text-slate-800 flex-1">
                      {goal.title || goal.goal_text}
                    </h3>
                  </div>
                  
                  {goal.title && goal.goal_text !== goal.title && (
                    <p className="text-slate-600 mb-3 text-sm ml-6">
                      {goal.goal_text}
                    </p>
                  )}

                  {goal.why && (
                    <div className="mb-3 ml-6">
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
                    className="hover:text-blue-600 transition-colors cursor-pointer text-2xl relative"
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
                    className="hover:text-blue-700 transition-colors relative text-2xl"
                    title="View sub-goals"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
