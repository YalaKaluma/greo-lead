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

export default function GoalCard({ goal, onClick, hasChildren, taskCount = 0, compact = false }) {
  const badge = getHorizonBadge(goal.time_horizon);

  return (
    <div
      onClick={() => onClick(goal)}
      className={`rounded-lg border-2 border-slate-300 bg-white hover:border-slate-400 transition-all duration-200 cursor-pointer ${
        compact ? 'p-2 lg:p-4' : 'p-4'
      }`}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-1">
        <div className="flex-1">
          <h3 className={`font-semibold text-slate-800 ${compact ? 'text-sm lg:text-lg' : 'text-lg'}`}>
            {goal.title || goal.goal_text?.substring(0, 60) || 'Untitled Goal'}
          </h3>
        </div>
      </div>

      {/* Goal description preview - hide on mobile in compact mode */}
      {goal.title && goal.goal_text && !compact && (
        <p className="text-sm text-slate-600 mb-2 line-clamp-2">
          {goal.goal_text}
        </p>
      )}

      {/* Why - hide on mobile in compact mode */}
      {goal.why && !compact && (
        <div className="mb-2 p-2 bg-slate-50 rounded border border-slate-200">
          <p className="text-xs font-medium text-slate-500 mb-1">WHY</p>
          <p className="text-sm text-slate-700 line-clamp-1">
            {goal.why}
          </p>
        </div>
      )}

      {/* Footer with badges - smaller on mobile */}
      <div className={`flex items-center justify-between ${compact ? 'mt-1 pt-1' : 'mt-3 pt-3'} border-t border-slate-200`}>
        <span className={`font-medium px-2 py-1 rounded bg-slate-100 text-slate-700 ${compact ? 'text-xs' : 'text-xs'}`}>
          {badge.label}
        </span>
        
        <div className="flex items-center gap-2">
          {/* Task count badge */}
          {taskCount > 0 && (
            <span className={`px-2 py-1 rounded bg-blue-100 text-blue-700 font-medium ${compact ? 'text-xs' : 'text-xs'}`}>
              {taskCount}
            </span>
          )}
          
          {/* Children indicator for long term goals */}
          {hasChildren && goal.time_horizon === 'long' && (
            <span className={`px-2 py-1 rounded bg-purple-100 text-purple-700 font-medium ${compact ? 'text-xs' : 'text-xs'}`}>
              ↓
            </span>
          )}
          
          {/* Arrow icon - smaller on mobile */}
          <svg className={`text-slate-400 ${compact ? 'w-4 h-4' : 'w-5 h-5'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </div>
    </div>
  );
}
