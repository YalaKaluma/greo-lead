import GoalCard from './GoalCard';

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

export default function GoalsList({ goals, onCardClick }) {
  
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
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 relative">
          {goalsList.map((goal, index) => (
            <div key={goal.id} className="relative">
              <GoalCard 
                goal={goal}
                onClick={onCardClick}
              />
              
              {/* Arrow between cards (desktop only) */}
              {index < goalsList.length - 1 && (
                <div className="hidden lg:flex absolute top-1/2 -right-2 transform translate-x-full -translate-y-1/2 items-center justify-center w-4 h-4 z-10">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path 
                      d="M6 2L12 8L6 14" 
                      stroke="#9CA3AF" 
                      strokeWidth="2" 
                      strokeLinecap="round" 
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  };

  // Render sections in order: long → medium → short
  return (
    <div className="space-y-8">
      {renderGoalSection('long', goals.long)}
      {renderGoalSection('medium', goals.medium)}
      {renderGoalSection('short', goals.short)}
      
      {/* Empty state */}
      {goals.long.length === 0 && goals.medium.length === 0 && goals.short.length === 0 && (
        <div className="text-center py-12">
          <div className="text-slate-400 mb-4">
            <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <p className="text-slate-500 text-lg">No goals yet</p>
          <p className="text-slate-400 text-sm mt-1">Click "+ Add Goal" to get started</p>
        </div>
      )}
    </div>
  );
}
