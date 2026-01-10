import GoalCard from './GoalCard';
import GoalTree from './GoalTree';

/* =========================================================
   TIME HORIZON LABELS
   ========================================================= */

const getHorizonLabel = (horizon) => {
  const labels = {
    long: 'LONG TERM',
    medium: 'MEDIUM TERM',
    short: 'SHORT TERM'
  };
  return labels[horizon] || 'OTHER';
};

/* =========================================================
   MAIN COMPONENT
   ========================================================= */

export default function GoalsList({ goals, expandedGoalId, onCardClick, allGoals }) {
  
  const renderGoalSection = (horizon, goalsList) => {
    if (goalsList.length === 0) return null;

    return (
      <div key={horizon} className="mb-8">
        {/* Section Header - ABOVE goals */}
        <div className="mb-4">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            {getHorizonLabel(horizon)}
          </h2>
        </div>

        {/* Goals Grid */}
        <div className="space-y-6">
          {goalsList.map((goal) => (
            <div key={goal.id}>
              {/* Goal Card */}
              <GoalCard 
                goal={goal}
                onClick={onCardClick}
              />
              
              {/* Expanded Tree View - shown inline below the clicked card */}
              {expandedGoalId === goal.id && (
                <div className="mt-4 ml-4">
                  <GoalTree 
                    parentGoal={goal} 
                    allGoals={allGoals}
                    onChildClick={onCardClick}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  };

  // Render ONLY long term goals on main page
  return (
    <div className="space-y-8">
      {renderGoalSection('long', goals.long)}
      
      {/* Empty state */}
      {goals.long.length === 0 && (
        <div className="text-center py-12">
          <div className="text-slate-400 mb-4">
            <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <p className="text-slate-500 text-lg">No long term goals yet</p>
          <p className="text-slate-400 text-sm mt-1">Click "+ Add Goal" to get started</p>
        </div>
      )}
    </div>
  );
}
