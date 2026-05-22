/* =========================================================
   RESPONSIVE CARD WITH HIERARCHY
   ========================================================= */

export default function GoalCard({ 
  goal, 
  onClick,
  onEdit,
  taskCount = 0, 
  isInTree = false,
  dragHandleProps = null,
  isDragging = false
}) {
  
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
    {...(dragHandleProps || {})}
    onClick={() => {
      if (!isDragging) {
        onClick(goal);
      }
    }}
    className={`
    relative rounded border border-slate-300 bg-white hover:bg-slate-50
    ${dragHandleProps ? (isDragging ? 'cursor-grabbing shadow-lg ring-2 ring-blue-300' : 'cursor-grab') : 'cursor-pointer'}
    ${isInTree ? 'p-1.5 lg:p-4' : 'p-3 lg:p-4'}
    ${isLongTerm ? 'border-2 border-blue-300' : ''}
  `}
>


{/* Edit button for Long Term goals */}
{isLongTerm && onEdit && (
  <button
    onClick={(e) => {
      e.stopPropagation();
      onEdit(goal);
    }}
    className="absolute top-3 right-3 p-1 rounded hover:bg-slate-200 transition"
  >
    <svg
      className="w-4 h-4 text-slate-500"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
      />
    </svg>
  </button>
)}












      {/* Title - responsive sizing with hierarchy */}
      <div className={`
        font-medium text-slate-800 leading-tight line-clamp-2
        ${!isInTree && isLongTerm ? 'text-base lg:text-xl lg:font-bold' : ''}
        ${isInTree && isLongTerm ? 'text-xs lg:text-xl lg:font-bold' : ''}
        ${isMediumTerm ? 'text-xs lg:text-base lg:font-semibold' : ''}
        ${!isLongTerm && !isMediumTerm ? 'text-[11px] lg:text-sm' : ''}
        ${isInTree ? 'mb-1 lg:mb-2' : 'mb-2'}
      `}>
        {goal.title || goal.goal_text?.substring(0, 60) || 'Untitled'}
      </div>
      
      {/* Footer with horizon and tasks */}
      <div className={`
        flex items-center justify-between
        ${isInTree ? 'text-[10px] lg:text-xs' : 'text-xs lg:text-xs'}
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
