/* =========================================================
   RESPONSIVE CARD WITH HIERARCHY
   ========================================================= */

export default function GoalCard({ goal, onClick, taskCount = 0 }) {
  
  // Full labels
  const getHorizonLabel = (horizon) => {
    const labels = {
      long: 'Long Term',
      medium: 'Medium Term',
      short: 'Short Term'
    };
    return labels[horizon] || 'Goal';
  };

  // Visual hierarchy - LT goals are most prominent
  const isLongTerm = goal.time_horizon === 'long';
  const isMediumTerm = goal.time_horizon === 'medium';

  return (
    <div
      onClick={() => onClick(goal)}
      className={`
        rounded border border-slate-300 bg-white hover:bg-slate-50 cursor-pointer
        p-1.5 lg:p-4
        ${isLongTerm ? 'border-2 border-blue-300' : ''}
      `}
    >
      {/* Title - responsive sizing with hierarchy */}
      <div className={`
        font-medium text-slate-800 leading-tight line-clamp-2
        ${isLongTerm ? 'text-[10px] lg:text-xl lg:font-bold' : ''}
        ${isMediumTerm ? 'text-[10px] lg:text-base lg:font-semibold' : ''}
        ${!isLongTerm && !isMediumTerm ? 'text-[10px] lg:text-sm' : ''}
        mb-1 lg:mb-2
      `}>
        {goal.title || goal.goal_text?.substring(0, 60) || 'Untitled'}
      </div>
      
      {/* Footer with horizon and tasks */}
      <div className={`
        flex items-center justify-between
        text-[9px] lg:text-xs
        ${isLongTerm ? 'lg:pt-2 lg:border-t lg:border-slate-200' : ''}
      `}>
        <span className={`
          text-slate-600
          ${isLongTerm ? 'lg:font-medium' : ''}
        `}>
          {getHorizonLabel(goal.time_horizon)}
        </span>
        {taskCount > 0 && (
          <span className="text-blue-600 lg:px-2 lg:py-1 lg:bg-blue-100 lg:rounded">
            {taskCount} task{taskCount !== 1 ? 's' : ''}
          </span>
        )}
      </div>
    </div>
  );
}
