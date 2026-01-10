/* =========================================================
   RESPONSIVE CARD WITH HIERARCHY
   ========================================================= */

export default function GoalCard({ 
  goal, 
  onClick, 
  taskCount = 0, 
  isInTree = false,
  draggable = false,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
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

  const handleDragStart = (e) => {
    e.stopPropagation();
    if (onDragStart) onDragStart(e, goal);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (onDragOver) onDragOver(e, goal);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (onDrop) onDrop(e, goal);
  };

  const handleDragEnd = (e) => {
    e.stopPropagation();
    if (onDragEnd) onDragEnd(e);
  };

  const handleClick = (e) => {
    // Don't trigger click if dragging
    if (!isDragging) {
      onClick(goal);
    }
  };

  return (
    <div
      draggable={draggable}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onDragEnd={handleDragEnd}
      onClick={handleClick}
      className={`
        rounded border border-slate-300 bg-white hover:bg-slate-50 cursor-pointer
        ${isInTree ? 'p-1.5 lg:p-4' : 'p-3 lg:p-4'}
        ${isLongTerm ? 'border-2 border-blue-300' : ''}
        ${isDragging ? 'opacity-50' : ''}
        ${draggable ? 'cursor-move' : ''}
        transition-opacity duration-150
      `}
    >
      <div className="flex items-start gap-2">
        {/* Drag handle */}
        {draggable && (
          <div className="text-slate-400 mt-0.5 cursor-move">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
            </svg>
          </div>
        )}

        <div className="flex-1 min-w-0">
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
      </div>
    </div>
  );
}
