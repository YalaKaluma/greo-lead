/* =========================================================
   TIME HORIZON LABELS
   ========================================================= */

const getHorizonBadge = (horizon) => {
  const badges = {
    long: { label: 'Long Term' },
    medium: { label: 'Medium Term' },
    short: { label: 'Short Term' }
  };
  return badges[horizon] || { label: 'Other' };
};

/* =========================================================
   MAIN COMPONENT
   ========================================================= */

export default function GoalCard({ goal, onClick, hasChildren, taskCount = 0 }) {
  const badge = getHorizonBadge(goal.time_horizon);

  return (
    <div
      onClick={() => onClick(goal)}
      className="p-4 rounded-lg border-2 border-slate-300 bg-white hover:border-slate-400 transition-all duration-200 cursor-pointer"
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1">
          <h3 className="font-semibold text-slate-800 text-lg mb-1">
            {goal.title || goal.goal_text?.substring(0, 60) || 'Untitled Goal'}
          </h3>
        </div>
      </div>

      {/* Goal description preview */}
      {goal.title && goal.goal_text && (
        <p className="text-sm text-slate-600 mb-3 line-clamp-2">
          {goal.goal_text}
        </p>
      )}

      {/* Why - highlighted */}
      {goal.why && (
        <div className="mb-3 p-2 bg-slate-50 rounded border border-slate-200">
          <p className="text-xs font-medium text-slate-500 mb-1">WHY</p>
          <p className="text-sm text-slate-700 line-clamp-2">
            {goal.why}
          </p>
        </div>
      )}

      {/* Footer with badges and indicators */}
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-200">
        <span className="text-xs font-medium px-2 py-1 rounded bg-slate-100 text-slate-700">
          {badge.label}
        </span>
        
        <div className="flex items-center gap-3">
          {/* Task count badge */}
          {taskCount > 0 && (
            <span className="text-xs px-2 py-1 rounded bg-blue-100 text-blue-700 font-medium">
              {taskCount} task{taskCount !== 1 ? 's' : ''}
            </span>
          )}
          
          {/* Children indicator for long term goals */}
          {hasChildren && goal.time_horizon === 'long' && (
            <span className="text-xs px-2 py-1 rounded bg-purple-100 text-purple-700 font-medium">
              Has breakdown
            </span>
          )}
          
          {/* Arrow icon */}
          <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </div>
    </div>
  );
}
