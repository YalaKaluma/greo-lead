import { useEffect, useState } from 'react';
import axios from 'axios';
import GoalsHeader from './GoalsHeader';
import GoalsList from './GoalsList';
import GoalViewPanel from './GoalViewPanel';
import GoalEditPanel from './GoalEditPanel';
import GoalCreateModal from './GoalCreateModal';

/* =========================================================
   HELPER FUNCTIONS
   ========================================================= */

const organizeGoalsByTimeHorizon = (goals) => {
  const organized = { long: [], medium: [], short: [] };
  
  goals.forEach(goal => {
    const horizon = goal.time_horizon || 'short';
    if (organized[horizon]) {
      organized[horizon].push(goal);
    }
  });

  // Sort by sort_order within each section
  Object.keys(organized).forEach(key => {
    organized[key].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  });

  return organized;
};

/* =========================================================
   MAIN COMPONENT
   ========================================================= */

export default function MyGoals({ apiUrl, userNumber }) {
  // Core data
  const [goals, setGoals] = useState([]);
  const [linkedTasks, setLinkedTasks] = useState({});
  const [taskCounts, setTaskCounts] = useState({});
  const [loading, setLoading] = useState(true);
  
  // UI state
  const [expandedGoalId, setExpandedGoalId] = useState(null);   // For tree expansion of LT goals
  const [viewingGoal, setViewingGoal] = useState(null);         // For view panel (MT/ST only)
  const [editingGoal, setEditingGoal] = useState(null);         // For edit panel
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [parentGoalForChild, setParentGoalForChild] = useState(null);

  /* ---------------- DATA FETCHING ---------------- */

  const fetchGoals = async () => {
    try {
      const res = await axios.get(`${apiUrl}/api/journey/goals`, {
        params: { user_number: userNumber }
      });
      if (res.data && Array.isArray(res.data)) {
        setGoals(res.data);
      }
    } catch (err) {
      console.error('Error fetching goals:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchAllLinkedTasks = async () => {
    try {
      const res = await axios.get(`${apiUrl}/api/tasks`, {
        params: { user_number: userNumber }
      });
      
      if (Array.isArray(res.data)) {
        // Group by goal_id
        const tasksByGoal = {};
        const counts = {};
        
        res.data.forEach(task => {
          if (task.goal_id) {
            if (!tasksByGoal[task.goal_id]) {
              tasksByGoal[task.goal_id] = [];
              counts[task.goal_id] = 0;
            }
            tasksByGoal[task.goal_id].push(task);
            counts[task.goal_id]++;
          }
        });
        
        setLinkedTasks(tasksByGoal);
        setTaskCounts(counts);
      }
    } catch (err) {
      console.error('Error fetching tasks:', err);
    }
  };

  useEffect(() => {
    fetchGoals();
    fetchAllLinkedTasks();
  }, [userNumber]);

  /* ---------------- EVENT HANDLERS ---------------- */

  const handleCardClick = (goal) => {
    // If it's a LONG TERM goal, toggle tree expansion
    if (goal.time_horizon === 'long') {
      setExpandedGoalId(expandedGoalId === goal.id ? null : goal.id);
      setViewingGoal(null);
      setEditingGoal(null);
    } 
    // If it's MEDIUM or SHORT TERM, open VIEW panel (not edit)
    else {
      setViewingGoal(goal);
      setEditingGoal(null);
    }
  };

  const handleEditClick = (goal) => {
    setEditingGoal(goal);
    setViewingGoal(null);
  };

  const handleClosePanel = () => {
    setViewingGoal(null);
    setEditingGoal(null);
    setParentGoalForChild(null);
  };

  const handleCreateChildGoal = (parentGoalId) => {
    setParentGoalForChild(parentGoalId);
    setShowCreateModal(true);
  };

  /* ---------------- CRUD OPERATIONS ---------------- */

  const handleCreateGoal = async (goalData) => {
    try {
      await axios.post(`${apiUrl}/api/journey/goals`, {
        ...goalData,
        user_number: userNumber
      });
      await fetchGoals();
      setShowCreateModal(false);
      setParentGoalForChild(null);
    } catch (err) {
      console.error('Error creating goal:', err);
      alert('Failed to create goal. Please try again.');
    }
  };

  const handleUpdateGoal = async (goalId, updates) => {
    try {
      await axios.put(`${apiUrl}/api/journey/goals/${goalId}`, {
        ...updates,
        user_number: userNumber
      });
      await fetchGoals();
      setEditingGoal(null);
    } catch (err) {
      console.error('Error updating goal:', err);
      alert('Failed to update goal. Please try again.');
    }
  };

  const handleDeleteGoal = async (goalId) => {
    if (!confirm('Are you sure you want to delete this goal?')) return;
    
    try {
      await axios.delete(`${apiUrl}/api/journey/goals/${goalId}`, {
        params: { user_number: userNumber }
      });
      await fetchGoals();
      setEditingGoal(null);
      setViewingGoal(null);
    } catch (err) {
      console.error('Error deleting goal:', err);
      alert('Failed to delete goal. Please try again.');
    }
  };

  /* ---------------- RENDER ---------------- */

  const organizedGoals = organizeGoalsByTimeHorizon(goals);

  return (
    <div className="max-w-7xl mx-auto p-4 lg:p-6">
      {/* Header */}
      <GoalsHeader onAddClick={() => setShowCreateModal(true)} />

      {/* Main content area */}
      <div className="relative flex">
        {/* Goals list - adjusts margin when panel is open */}
        <div className={`flex-1 transition-all duration-300 ${
          (viewingGoal || editingGoal) ? 'lg:mr-[600px]' : ''
        }`}>
          {loading ? (
            <div className="text-center py-12 text-slate-500">
              Loading goals...
            </div>
          ) : (
            <GoalsList 
              goals={organizedGoals}
              expandedGoalId={expandedGoalId}
              onCardClick={handleCardClick}
              allGoals={goals}
              taskCounts={taskCounts}
            />
          )}
        </div>

        {/* View panel - for MEDIUM/SHORT TERM goals */}
        {viewingGoal && (
          <GoalViewPanel
            goal={viewingGoal}
            linkedTasks={linkedTasks[viewingGoal.id] || []}
            onClose={handleClosePanel}
            onEdit={handleEditClick}
          />
        )}

        {/* Edit panel - opened from View panel */}
        {editingGoal && (
          <GoalEditPanel
            goal={editingGoal}
            goals={goals}
            linkedTasks={linkedTasks[editingGoal.id] || []}
            onClose={handleClosePanel}
            onSave={handleUpdateGoal}
            onDelete={handleDeleteGoal}
          />
        )}
      </div>

      {/* Create modal */}
      {showCreateModal && (
        <GoalCreateModal
          goals={goals}
          parentGoalId={parentGoalForChild}
          onClose={() => {
            setShowCreateModal(false);
            setParentGoalForChild(null);
          }}
          onCreate={handleCreateGoal}
        />
      )}
    </div>
  );
}
