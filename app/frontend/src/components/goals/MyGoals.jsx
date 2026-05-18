import { useEffect, useState } from 'react';
import axios from 'axios';
import GoalsHeader from './GoalsHeader';
import GoalsList from './GoalsList';
import GoalReviewRecap from './GoalReviewRecap';
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
  const [reviewSessions, setReviewSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // UI state
  const [activeTab, setActiveTab] = useState('setting');
  const [expandedGoalId, setExpandedGoalId] = useState(null);
  const [viewingGoal, setViewingGoal] = useState(null);
  const [editingGoal, setEditingGoal] = useState(null);
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
    }
  };

  const fetchAllLinkedTasks = async () => {
    try {
      const res = await axios.get(`${apiUrl}/api/tasks`, {
        params: { user_number: userNumber }
      });
      
      if (Array.isArray(res.data)) {
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

  const fetchGoalReviews = async () => {
    try {
      const res = await axios.get(`${apiUrl}/api/journey/goal-reviews`, {
        params: { user_number: userNumber }
      });
      
      if (res.data && res.data.sessions) {
        setReviewSessions(res.data.sessions);
      }
    } catch (err) {
      console.error('Error fetching goal reviews:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const loadData = async () => {
      await fetchGoals();
      await fetchAllLinkedTasks();
      await fetchGoalReviews();
    };
    loadData();
  }, [userNumber]);

  /* ---------------- EVENT HANDLERS ---------------- */

  const handleCardClick = (goal) => {
    if (goal.time_horizon === 'long') {
      setExpandedGoalId(expandedGoalId === goal.id ? null : goal.id);
      setViewingGoal(null);
      setEditingGoal(null);
    } else {
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
    setViewingGoal(null);
  };

  /* ---------------- CRUD OPERATIONS ---------------- */

  const handleCreateGoal = async (goalData) => {
    try {
      await axios.post(
        `${apiUrl}/api/journey/goals`,
        goalData,
        { params: { user_number: userNumber } }
      );
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
      await axios.put(
        `${apiUrl}/api/journey/goals/${goalId}`,
        updates,
        { params: { user_number: userNumber } }
      );
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

      {/* Tab Navigation */}
      <div className="mb-6 border-b border-slate-200">
        <div className="flex gap-6">
          <button
            onClick={() => setActiveTab('setting')}
            className={`pb-3 px-2 font-medium transition-colors relative ${
              activeTab === 'setting'
                ? 'text-blue-600'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Goal Setting
            {activeTab === 'setting' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('review')}
            className={`pb-3 px-2 font-medium transition-colors relative ${
              activeTab === 'review'
                ? 'text-blue-600'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Progress Review
            {activeTab === 'review' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />
            )}
          </button>
        </div>
      </div>

      {/* Main content area */}
      <div className="relative">
        {loading ? (
          <div className="text-center py-12 text-slate-500">
            Loading goals...
          </div>
        ) : (
          <>
            {/* Goal Setting Tab */}
            {activeTab === 'setting' && (
              <GoalsList 
                goals={organizedGoals}
                expandedGoalId={expandedGoalId}
                onCardClick={handleCardClick}
                onEditClick={handleEditClick}
                taskCounts={taskCounts}
              />
            )}

            {/* Progress Review Tab */}
            {activeTab === 'review' && (
              <GoalReviewRecap
                goals={organizedGoals}
                reviewSessions={reviewSessions}
                expandedGoalId={expandedGoalId}
                onCardClick={handleCardClick}
                taskCounts={taskCounts}
              />
            )}
          </>
        )}

        {/* View/Edit panels */}
        {viewingGoal && (
          <GoalViewPanel
            goal={viewingGoal}
            linkedTasks={linkedTasks[viewingGoal.id] || []}
            allGoals={goals}
            onClose={handleClosePanel}
            onEdit={handleEditClick}
            onCreateChildGoal={handleCreateChildGoal}
          />
        )}

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
