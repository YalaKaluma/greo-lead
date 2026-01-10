/* =========================================================
   TIME HORIZON LABELS
   ========================================================= */

const getHorizonBadge = (horizon) => {
  const badges = {
    long: { label: 'LT' },
    medium: { label: 'MT' },
    short: { label: 'ST' }
  };
  return badges[horizon] || { label: 'Goal' };
};

/* =========================================================
   MAIN COMPONENT
   ========================================================= */

export default function GoalCard({ goal, onClick, hasChildren, taskCount = 0 }) {
  const badge = getHorizonBadge(goal.time_horizon);

  return (
    <div
      onClick={() => onClick(goal)}
      className="p-3 rounded-lg border-2 border-slate-300 bg-white hover:border-slate-400 transition-all duration-200 cursor-pointer"
    >
      {/* Title */}
      <h3 className="font-semibold text-slate-800 text-base mb-2 line-clamp-2">
        {goal.title || goal.goal_text?.substring(0, 80) || 'Untitled Goal'}
      </h3>

      {/* Footer with badges - compact for mobile */}
      <div className="flex items-center justify-between pt-2 border-t border-slate-200">
        <span className="text-xs font-medium px-2 py-1 rounded bg-slate-100 text-slate-700">
          {badge.label}
        </span>
        
        <div className="flex items-center gap-2">
          {/* Task count badge */}
          {taskCount > 0 && (
            <span className="text-xs px-2 py-1 rounded bg-blue-100 text-blue-700 font-medium">
              {taskCount}
            </span>
          )}
          
          {/* Arrow icon */}
          <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </div>
    </div>
  );
}
