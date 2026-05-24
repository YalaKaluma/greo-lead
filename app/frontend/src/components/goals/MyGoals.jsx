import { useEffect, useState } from 'react';
import axios from 'axios';
import GoalsHeader from './GoalsHeader';
import GoalsList from './GoalsList';
import GoalReviewRecap from './GoalReviewRecap';
import GoalViewPanel from './GoalViewPanel';
import GoalEditPanel from './GoalEditPanel';
import GoalCreateModal from './GoalCreateModal';
import TransformationRoadmap from './TransformationRoadmap';
import { normalizeGoalLevel, isVision } from '../../utils/goalTaxonomy';

/* =========================================================
   HELPER FUNCTIONS
   ========================================================= */

const organizeGoalsByTimeHorizon = (goals) => {
  const organized = { vision: [], pillar: [], outcome: [] };
  
  goals.forEach(goal => {
    const horizon = normalizeGoalLevel(goal.time_horizon);
    if (organized[horizon]) {
      organized[horizon].push(goal);
    }
  });

  Object.keys(organized).forEach(key => {
    organized[key].sort((a, b) => {
      const orderDiff = (a.sort_order || 0) - (b.sort_order || 0);
      if (orderDiff !== 0) return orderDiff;
      return new Date(b.first_seen_at || 0) - new Date(a.first_seen_at || 0);
    });
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
  const [createGoalLevel, setCreateGoalLevel] = useState('vision');
  const [waveModalRequest, setWaveModalRequest] = useState(0);
  const [reorderError, setReorderError] = useState('');

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
    if (isVision(goal)) {
      setExpandedGoalId(goal.id);
      setActiveTab('setting');
      setViewingGoal(null);
      setEditingGoal(null);
    } else {
      setViewingGoal(goal);
      setEditingGoal(null);
    }
  };

  const persistGoalOrder = async ({ parentId = null, goalType, orderedGoalIds }) => {
    await axios.patch(
      `${apiUrl}/api/journey/goals/reorder`,
      {
        parent_id: parentId,
        goal_type: goalType,
        ordered_goal_ids: orderedGoalIds
      },
      { params: { user_number: userNumber } }
    );
  };

  const handleReorderGoals = async ({ parentId = null, goalType, orderedGoals }) => {
    const previousGoals = goals;
    const orderById = new Map(orderedGoals.map((goal, index) => [goal.id, index]));

    setReorderError('');
    setGoals(currentGoals =>
      currentGoals.map(goal =>
        orderById.has(goal.id)
          ? { ...goal, sort_order: orderById.get(goal.id) }
          : goal
      )
    );

    try {
      await persistGoalOrder({
        parentId,
        goalType,
        orderedGoalIds: orderedGoals.map(goal => goal.id)
      });
    } catch (err) {
      console.error('Error reordering goals:', err);
      setGoals(previousGoals);
      setReorderError('Could not save the new order. Your previous order has been restored.');
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

  const openCreateGoalModal = (level, parentGoalId = null) => {
    setCreateGoalLevel(level);
    setParentGoalForChild(parentGoalId);
    setShowCreateModal(true);
    setViewingGoal(null);
    setEditingGoal(null);
  };

  const handleCreateChildGoal = (parentGoalId) => {
    const parentGoal = goals.find(goal => goal.id === parentGoalId);
    const parentLevel = normalizeGoalLevel(parentGoal?.time_horizon);
    openCreateGoalModal(parentLevel === 'vision' ? 'pillar' : 'outcome', parentGoalId);
  };

  const handleCreateWave = () => {
    if (!expandedGoalId) {
      alert('Select a vision first, then add a wave.');
      return;
    }
    setActiveTab('roadmap');
    setWaveModalRequest(count => count + 1);
  };

  const handleCreatePillar = () => {
    setActiveTab('setting');
    openCreateGoalModal('pillar', expandedGoalId || null);
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
      <GoalsHeader
        onAddVision={() => openCreateGoalModal('vision')}
        onAddWave={handleCreateWave}
        onAddPillar={handleCreatePillar}
      />

      {expandedGoalId && (
        <>
          <button
            onClick={() => {
              setExpandedGoalId(null);
              setActiveTab('setting');
              setViewingGoal(null);
              setEditingGoal(null);
            }}
            className="mb-4 text-sm text-slate-600 hover:text-slate-900"
          >
            &larr; All visions
          </button>

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
                onClick={() => setActiveTab('roadmap')}
                className={`pb-3 px-2 font-medium transition-colors relative ${
                  activeTab === 'roadmap'
                    ? 'text-blue-600'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                Transformation Roadmap
                {activeTab === 'roadmap' && (
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
        </>
      )}

      {/* Main content area */}
      <div className="relative">
        {loading ? (
          <div className="text-center py-12 text-slate-500">
            Loading goals...
          </div>
        ) : (
          <>
            {!expandedGoalId && (
              <GoalsList 
                goals={organizedGoals}
                expandedGoalId={null}
                onCardClick={handleCardClick}
                onEditClick={handleEditClick}
                onReorderGoals={handleReorderGoals}
                taskCounts={taskCounts}
              />
            )}

            {/* Goal Setting Tab */}
            {expandedGoalId && activeTab === 'setting' && (
              <>
              {reorderError && (
                <div className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {reorderError}
                </div>
              )}
              <GoalsList 
                goals={organizedGoals}
                expandedGoalId={expandedGoalId}
                onCardClick={handleCardClick}
                onEditClick={handleEditClick}
                onReorderGoals={handleReorderGoals}
                onCreateChildGoal={handleCreateChildGoal}
                taskCounts={taskCounts}
              />
              </>
            )}

            {expandedGoalId && activeTab === 'roadmap' && (
              <TransformationRoadmap
                apiUrl={apiUrl}
                userNumber={userNumber}
                goals={goals}
                selectedVisionId={expandedGoalId}
                onGoalsChanged={fetchGoals}
                waveModalRequest={waveModalRequest}
              />
            )}

            {/* Progress Review Tab */}
            {expandedGoalId && activeTab === 'review' && (
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
          initialGoalLevel={createGoalLevel}
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
