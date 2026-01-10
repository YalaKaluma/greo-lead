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

export default function GoalCard({ goal, onClick, dragHandleProps }) {
  const badge = getHorizonBadge(goal.time_horizon);

  return (
    <div
      onClick={() => onClick(goal)}
      className="p-4 rounded-lg border-2 border-slate-300 bg-white hover:border-slate-400 transition-all duration-200 cursor-pointer"
    >
      {/* Header with drag handle (if provided) */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1">
          <h3 className="font-semibold text-slate-800 text-lg mb-1">
            {goal.title || 'Untitled Goal'}
          </h3>
        </div>
        
        {/* Drag Handle - Phase 2 */}
        {dragHandleProps && (
          <div
            {...dragHandleProps}
            className="ml-2 text-gray-400 cursor-move hover:text-gray-600 transition-colors"
            onClick={(e) => e.stopPropagation()} // Prevent card click when dragging
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
            </svg>
          </div>
        )}
      </div>

      {/* Goal description preview */}
      {goal.goal_text && (
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

      {/* Footer with time horizon badge */}
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-200">
        <span className="text-xs font-medium px-2 py-1 rounded bg-slate-100 text-slate-700">
          {badge.label}
        </span>
        
        {/* Arrow icon to indicate clickability */}
        <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </div>
  );
}
