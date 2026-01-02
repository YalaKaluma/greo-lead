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

export default function MyGoals({ apiUrl = '', userNumber, onNavigate }) {
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

  // Handle navigation to tasks page filtered by goal
  const handleViewTasks = (e, goalId) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (onNavigate) {
      // Use the onNavigate callback if provided
      onNavigate('todo-list', { goalFilter: goalId });
    } else {
      // Fallback to URL navigation
      window.location.href = `/?page=todo-list&goal=${goalId}`;
    }
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
    <div className="max-w-7xl mx-auto p-4 sm:p-6">
      {/* Edit Modal Overlay */}
      {editingGoalId && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <GoalForm
              goal={goals.find(g => g.id === editingGoalId)}
              goals={goals}
              onSubmit={(data) => updateGoal(editingGoalId, data)}
              onCancel={() => setEditingGoalId(null)}
              onDelete={() => deleteGoal(editingGoalId)}
            />
          </div>
        </div>
      )}

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
        <GoalForm
          goals={goals}
          onSubmit={addGoal}
          onCancel={() => setShowAddForm(false)}
        />
      )}

      {/* Time Horizon Filter */}
      {!hierarchicalView && (
        <div className="mb-6 flex gap-2 sm:gap-3 overflow-x-auto">
          <button
            onClick={() => setTimeFilter('long')}
            className={`px-4 sm:px-6 py-2 sm:py-3 rounded-lg font-medium transition-all whitespace-nowrap text-sm sm:text-base ${
              timeFilter === 'long'
                ? 'bg-slate-800 text-white shadow-md'
                : 'bg-white text-slate-700 border border-gray-300 hover:bg-gray-50'
            }`}
          >
            <span className="hidden sm:inline">Long Term</span>
            <span className="sm:hidden">LT</span>
          </button>
          <button
            onClick={() => setTimeFilter('medium')}
            className={`px-4 sm:px-6 py-2 sm:py-3 rounded-lg font-medium transition-all whitespace-nowrap text-sm sm:text-base ${
              timeFilter === 'medium'
                ? 'bg-slate-800 text-white shadow-md'
                : 'bg-white text-slate-700 border border-gray-300 hover:bg-gray-50'
            }`}
          >
            <span className="hidden sm:inline">Medium Term</span>
            <span className="sm:hidden">MT</span>
          </button>
          <button
            onClick={() => setTimeFilter('short')}
            className={`px-4 sm:px-6 py-2 sm:py-3 rounded-lg font-medium transition-all whitespace-nowrap text-sm sm:text-base ${
              timeFilter === 'short'
                ? 'bg-slate-800 text-white shadow-md'
                : 'bg-white text-slate-700 border border-gray-300 hover:bg-gray-50'
            }`}
          >
            <span className="hidden sm:inline">Short Term</span>
            <span className="sm:hidden">ST</span>
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
          } else if (timeFilter === 'short') {
            // For short-term goals, sort them by their Medium Term parent (if any)
            const getMediumTermParentLabel = (g) => {
              let current = g;
              let safety = 0;

              while (current?.parent_goal_id && safety < 25) {
                safety++;
                const parent = goals.find(p => p.id === current.parent_goal_id);
                if (!parent) break;
                current = parent;
                if (current.time_horizon === 'medium') return current.title || current.goal_text;
              }
              return null;
            };

            filteredGoals = filteredGoals.slice().sort((a, b) => {
              const aMediumTerm = getMediumTermParentLabel(a);
              const bMediumTerm = getMediumTermParentLabel(b);

              if (aMediumTerm && !bMediumTerm) return -1;
              if (!aMediumTerm && bMediumTerm) return 1;
              if (!aMediumTerm && !bMediumTerm) return (a.sort_order || 0) - (b.sort_order || 0);

              const cmp = (aMediumTerm || '').localeCompare(bMediumTerm || '');
              return cmp !== 0 ? cmp : (a.sort_order || 0) - (b.sort_order || 0);
            });
          } else {
            // For long term, just sort by sort_order
            filteredGoals.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
          }
        }

        if (hierarchicalView && parentGoal) {
          // Get medium and short term children
          const mediumChildren = goals.filter(g => 
            g.parent_goal_id === parentGoal.id && g.time_horizon === 'medium'
          ).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
          
          // Function to get short term children for a specific goal
          const getShortTermChildren = (parentId) => {
            return goals.filter(g => 
              g.parent_goal_id === parentId && g.time_horizon === 'short'
            ).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
          };
          
          // Check if any MT goal has ST children
          const hasAnyShortTermGoals = mediumChildren.some(mg => getShortTermChildren(mg.id).length > 0);

          return (
            <div className="space-y-6">
              {/* Back Button - simplified */}
              <button
                onClick={() => setHierarchicalView(null)}
                className="flex items-center gap-2 text-blue-600 hover:text-blue-700 font-medium"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Back to Overview
              </button>

              {/* Long Term Goal with Label - IMPROVED MOBILE LAYOUT */}
              <div className="flex flex-col sm:flex-row gap-2 sm:gap-6 items-start">
                {/* Label - Positioned above on mobile, to left on desktop */}
                <div className="sm:w-32 flex-shrink-0 sm:pt-4">
                  <div className="text-xs sm:text-sm font-semibold text-slate-600 uppercase tracking-wide">
                    Long Term
                  </div>
                </div>
                
                {/* Goal Card */}
                <div className="flex-1 relative w-full">
                  <div 
                    className="bg-white border-2 border-slate-300 rounded-lg p-4 sm:p-6 cursor-pointer hover:shadow-md transition-shadow relative"
                  >
                    {/* Task link in upper right corner */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleViewTasks(e, parentGoal.id);
                      }}
                      className="absolute top-2 right-2 sm:top-3 sm:right-3 hover:text-blue-600 transition-colors text-slate-400 text-lg sm:text-xl"
                      title="View tasks"
                    >
                      📋
                      {taskCounts[parentGoal.id] > 0 && (
                        <span className="absolute -top-1 -right-1 bg-blue-900 text-white text-xs w-4 h-4 rounded-full flex items-center justify-center" style={{ fontSize: '10px' }}>
                          {taskCounts[parentGoal.id]}
                        </span>
                      )}
                    </button>

                    <div onClick={() => setEditingGoalId(parentGoal.id)}>
                      <h2 className="text-lg sm:text-xl md:text-2xl font-bold text-slate-800 mb-2 pr-8">
                        {parentGoal.title || parentGoal.goal_text}
                      </h2>
                      {parentGoal.title && parentGoal.goal_text !== parentGoal.title && (
                        <p className="text-sm sm:text-base text-slate-600 mb-3">
                          {parentGoal.goal_text}
                        </p>
                      )}
                      {parentGoal.why && (
                        <div>
                          <span className="text-xs sm:text-sm font-medium text-slate-600">Why: </span>
                          <span className="text-xs sm:text-sm text-slate-600">{parentGoal.why}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {/* Vertical line going down from long term - OUTSIDE the box */}
                  {mediumChildren.length > 0 && (
                    <div className="absolute left-1/2 transform -translate-x-1/2 w-0.5 bg-slate-300 h-6" style={{ top: '100%' }}></div>
                  )}
                </div>
              </div>

              {/* Medium Term Goals with Label - IMPROVED MOBILE LAYOUT */}
              {mediumChildren.length > 0 && (
                <div className="flex flex-col sm:flex-row gap-2 sm:gap-6 items-start">
                  {/* Label - Positioned above on mobile, to left on desktop */}
                  <div className="sm:w-32 flex-shrink-0 sm:pt-4">
                    <div className="text-xs sm:text-sm font-semibold text-slate-600 uppercase tracking-wide">
                      Medium Term
                    </div>
                  </div>
                  
                  {/* Goals Grid */}
                  <div className="flex-1 relative pt-6 w-full">
                    {/* Horizontal line - only on desktop, hidden on mobile */}
                    <div className="hidden sm:block absolute h-0.5 bg-slate-300 top-0" 
                         style={{ 
                           left: 'calc(16.666% / 2)', // Center of first column in 3-col grid
                           right: 'calc(16.666% / 2)' // Center of last column in 3-col grid
                         }}>
                    </div>
                    
                    <div className="grid grid-cols-3 gap-2 sm:gap-4">
                      {mediumChildren.map((medGoal) => {
                        const shortTermChildren = getShortTermChildren(medGoal.id);
                        
                        return (
                          <div key={medGoal.id} className="relative">
                            {/* Vertical line up to horizontal line - OUTSIDE the box - hidden on mobile */}
                            <div className="hidden sm:block absolute left-1/2 transform -translate-x-1/2 w-0.5 bg-slate-300 h-6 -top-6"></div>
                            
                            {/* Medium Term Goal Card */}
                            <div
                              className="bg-white border-2 border-slate-300 rounded-lg p-2 sm:p-3 md:p-4 cursor-pointer hover:shadow-md transition-shadow relative"
                            >
                              {/* Task link in upper right corner */}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleViewTasks(e, medGoal.id);
                                }}
                                className="absolute top-1.5 right-1.5 sm:top-2 sm:right-2 hover:text-blue-600 transition-colors text-slate-400 text-base sm:text-lg"
                                title="View tasks"
                              >
                                📋
                                {taskCounts[medGoal.id] > 0 && (
                                  <span className="absolute -top-1 -right-1 bg-blue-900 text-white text-xs w-4 h-4 rounded-full flex items-center justify-center" style={{ fontSize: '10px' }}>
                                    {taskCounts[medGoal.id]}
                                  </span>
                                )}
                              </button>

                              <div onClick={() => setEditingGoalId(medGoal.id)}>
                                <h4 className="font-bold text-slate-800 text-xs sm:text-sm md:text-base mb-1 sm:mb-2 leading-tight break-words pr-6">
                                  {medGoal.title || medGoal.goal_text}
                                </h4>
                                {medGoal.title && medGoal.goal_text !== medGoal.title && (
                                  <p className="text-xs text-slate-600 mb-1 sm:mb-2 line-clamp-2 break-words">
                                    {medGoal.goal_text}
                                  </p>
                                )}
                                {medGoal.why && (
                                  <p className="text-xs text-slate-500 italic line-clamp-2 break-words">
                                    {medGoal.why}
                                  </p>
                                )}
                              </div>
                            </div>
                            
                            {/* Short Term Goals stacked underneath this MT goal */}
                            {shortTermChildren.length > 0 && (
                              <div className="mt-3 sm:mt-4 pl-4 sm:pl-6 md:pl-10 relative">
                                {/* Vertical line down from MT goal - starts BELOW the box */}
                                <div className="absolute left-3 sm:left-5 w-0.5 bg-slate-300" style={{ top: '-16px', height: 'calc(100% + 16px)' }}></div>
                                
                                {/* Stack of short term goals */}
                                <div className="space-y-2 sm:space-y-3">
                                  {shortTermChildren.map((shortGoal, idx) => (
                                    <div key={shortGoal.id} className="relative">
                                      {/* Horizontal line connecting to vertical - shortened to not overlap */}
                                      <div className="absolute top-1/2 w-2 sm:w-3 h-0.5 bg-slate-300 -left-2 sm:-left-3"></div>
                                      
                                      {/* Arrow pointing right - moved 2px left to not overlap box */}
                                      <div className="absolute top-1/2 transform -translate-y-1/2" style={{ left: '-2px' }}>
                                        <svg width="6" height="6" viewBox="0 0 6 6" className="text-slate-300">
                                          <polygon points="6,3 0,0 0,6" fill="currentColor"/>
                                        </svg>
                                      </div>
                                      
                                      {/* Short term goal card */}
                                      <div
                                        className="bg-white border border-slate-300 rounded-lg p-1.5 sm:p-2 md:p-3 cursor-pointer hover:shadow-md transition-shadow relative"
                                      >
                                        {/* Task link in upper right corner */}
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleViewTasks(e, shortGoal.id);
                                          }}
                                          className="absolute top-1 right-1 sm:top-1.5 sm:right-1.5 hover:text-blue-600 transition-colors text-slate-400 text-sm sm:text-base"
                                          title="View tasks"
                                        >
                                          📋
                                          {taskCounts[shortGoal.id] > 0 && (
                                            <span className="absolute -top-1 -right-1 bg-blue-900 text-white text-xs w-3 h-3 sm:w-4 sm:h-4 rounded-full flex items-center justify-center" style={{ fontSize: '9px' }}>
                                              {taskCounts[shortGoal.id]}
                                            </span>
                                          )}
                                        </button>

                                        <div
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setEditingGoalId(shortGoal.id);
                                          }}
                                        >
                                          <h5 className="font-medium text-slate-800 text-xs sm:text-sm mb-0.5 sm:mb-1 leading-tight break-words pr-5">
                                            {shortGoal.title || shortGoal.goal_text}
                                          </h5>
                                          {shortGoal.title && shortGoal.goal_text !== shortGoal.title && (
                                            <p className="text-xs text-slate-500 line-clamp-2 break-words">
                                              {shortGoal.goal_text}
                                            </p>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
              
              {/* Short Term Label - IMPROVED MOBILE LAYOUT */}
              {hasAnyShortTermGoals && (
                <div className="flex flex-col sm:flex-row gap-2 sm:gap-6" style={{ marginTop: '0' }}>
                  <div className="sm:w-32 flex-shrink-0">
                    <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                      Short Term
                    </div>
                  </div>
                  <div className="flex-1"></div>
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

        // For Short Term: Group by Medium Term parent
        if (timeFilter === 'short') {
          const getMediumTermParent = (g) => {
            let current = g;
            let safety = 0;
            while (current?.parent_goal_id && safety < 25) {
              safety++;
              const parent = goals.find(p => p.id === current.parent_goal_id);
              if (!parent) break;
              current = parent;
              if (current.time_horizon === 'medium') return current;
            }
            return null;
          };

          // Group goals by their medium-term parent
          const grouped = {};
          filteredGoals.forEach(goal => {
            const parent = getMediumTermParent(goal);
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
                          <h3 className="text-base sm:text-lg font-bold text-slate-700">
                            🎯 {group.parent.title || group.parent.goal_text}
                          </h3>
                          <p className="text-xs sm:text-sm text-slate-500 mt-1">
                            Medium-term goal • {group.goals.length} short-term {group.goals.length === 1 ? 'goal' : 'goals'}
                          </p>
                        </div>
                        <button
                          onClick={() => setHierarchicalView(group.parent.id)}
                          className="text-blue-600 hover:text-blue-700 text-xs sm:text-sm font-medium px-2 sm:px-3 py-1 rounded border border-blue-300 hover:bg-blue-50 transition-colors whitespace-nowrap"
                        >
                          View Tree →
                        </button>
                      </div>
                    </div>
                  )}
                  {!group.parent && group.goals.length > 0 && (
                    <div className="mb-4 pb-3 border-b-2 border-slate-300">
                      <h3 className="text-base sm:text-lg font-bold text-slate-700">
                        📌 Independent Goals
                      </h3>
                      <p className="text-xs sm:text-sm text-slate-500 mt-1">
                        Not linked to a medium-term goal
                      </p>
                    </div>
                  )}

                  {/* Goals Grid */}
                  <div className="grid gap-3 sm:gap-4 md:grid-cols-2 lg:grid-cols-3">
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
                            <button
                              onClick={(e) => handleViewTasks(e, goal.id)}
                              className="hover:text-blue-600 transition-colors cursor-pointer text-xl sm:text-xl sm:text-2xl relative"
                              title="View tasks"
                            >
                              📋
                              {taskCounts[goal.id] > 0 && (
                                <span className="absolute -top-1 -right-1 bg-blue-900 text-white text-xs w-4 h-4 rounded-full flex items-center justify-center" style={{ fontSize: '10px' }}>
                                  {taskCounts[goal.id]}
                                </span>
                              )}
                            </button>

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
                      )
                    ))}
                  </div>
                </div>
              ))}
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
                          <h3 className="text-base sm:text-lg font-bold text-slate-700">
                            🎯 {group.parent.title || group.parent.goal_text}
                          </h3>
                          <p className="text-xs sm:text-sm text-slate-500 mt-1">
                            Long-term goal • {group.goals.length} medium-term {group.goals.length === 1 ? 'goal' : 'goals'}
                          </p>
                        </div>
                        <button
                          onClick={() => setHierarchicalView(group.parent.id)}
                          className="text-blue-600 hover:text-blue-700 text-xs sm:text-sm font-medium px-2 sm:px-3 py-1 rounded border border-blue-300 hover:bg-blue-50 transition-colors whitespace-nowrap"
                        >
                          View Tree →
                        </button>
                      </div>
                    </div>
                  )}
                  {!group.parent && group.goals.length > 0 && (
                    <div className="mb-4 pb-3 border-b-2 border-slate-300">
                      <h3 className="text-base sm:text-lg font-bold text-slate-700">
                        📌 Independent Goals
                      </h3>
                      <p className="text-xs sm:text-sm text-slate-500 mt-1">
                        Not linked to a long-term goal
                      </p>
                    </div>
                  )}

                  {/* Goals Grid */}
                  <div className="grid gap-3 sm:gap-4 md:grid-cols-2 lg:grid-cols-3">
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
                                <span className="text-xs sm:text-sm font-medium text-slate-600">Why: </span>
                                <span className="text-xs sm:text-sm text-slate-600">{goal.why}</span>
                              </div>
                            )}
                          </div>

                          <div className="mt-2 sm:mt-3 flex gap-3 sm:gap-4 items-center justify-end text-slate-400">
                            <button
                              onClick={(e) => handleViewTasks(e, goal.id)}
                              className="hover:text-blue-600 transition-colors cursor-pointer text-xl sm:text-2xl relative"
                              title="View tasks"
                            >
                              📋
                              {taskCounts[goal.id] > 0 && (
                                <span className="absolute -top-1 -right-1 bg-blue-900 text-white text-xs w-4 h-4 rounded-full flex items-center justify-center" style={{ fontSize: '10px' }}>
                                  {taskCounts[goal.id]}
                                </span>
                              )}
                            </button>

                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setHierarchicalView(goal.id);
                              }}
                              className="hover:text-blue-700 transition-colors relative text-2xl"
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
                      )
                    ))}
                  </div>
                </div>
              ))}
            </div>
          );
        }

        // For Long Term: Regular grid
        return (
          <div className="grid gap-3 sm:gap-4 md:grid-cols-2 lg:grid-cols-3">
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
                  <button
                    onClick={(e) => handleViewTasks(e, goal.id)}
                    className="hover:text-blue-600 transition-colors cursor-pointer text-xl sm:text-xl sm:text-2xl relative"
                    title="View tasks"
                  >
                    📋
                    {taskCounts[goal.id] > 0 && (
                      <span className="absolute -top-1 -right-1 bg-blue-900 text-white text-xs w-4 h-4 rounded-full flex items-center justify-center" style={{ fontSize: '10px' }}>
                        {taskCounts[goal.id]}
                      </span>
                    )}
                  </button>

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