/* =========================================================
   MINIMAL CARD FOR MOBILE
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

  return (
    <div
      onClick={() => onClick(goal)}
      className="p-1.5 rounded border border-slate-300 bg-white hover:bg-slate-50 cursor-pointer"
    >
      {/* Title - tiny */}
      <div className="text-[10px] font-medium text-slate-800 leading-tight line-clamp-2 mb-1">
        {goal.title || goal.goal_text?.substring(0, 40) || 'Untitled'}
      </div>
      
      {/* Footer with horizon and tasks */}
      <div className="flex items-center justify-between text-[9px]">
        <span className="text-slate-600">
          {getHorizonLabel(goal.time_horizon)}
        </span>
        {taskCount > 0 && (
          <span className="text-blue-600">
            {taskCount} tasks
          </span>
        )}
      </div>
    </div>
  );
}
