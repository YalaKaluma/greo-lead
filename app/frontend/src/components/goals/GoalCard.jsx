import { getGoalLevelLabel, isVision, isPillar } from '../../utils/goalTaxonomy';

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
  
  // Visual hierarchy - visions are most prominent
  const isVisionGoal = isVision(goal);
  const isPillarGoal = isPillar(goal);
  const isStarterExample = Boolean(goal.is_starter_example);

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
    ${isStarterExample ? 'border-slate-200 bg-slate-100 opacity-50 grayscale hover:bg-slate-100' : ''}
    ${dragHandleProps ? (isDragging ? 'cursor-grabbing shadow-lg ring-2 ring-blue-300' : 'cursor-grab') : 'cursor-pointer'}
    ${isInTree ? 'p-1.5 lg:p-4' : 'p-3 lg:p-4'}
    ${isVisionGoal && !isStarterExample ? 'border-2 border-blue-300' : ''}
  `}
>


{/* Edit button for visions */}
{isVisionGoal && onEdit && (
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
        ${!isInTree && isVisionGoal ? 'text-base lg:text-xl lg:font-bold' : ''}
        ${isInTree && isVisionGoal ? 'text-xs lg:text-xl lg:font-bold' : ''}
        ${isPillarGoal ? 'text-xs lg:text-base lg:font-semibold' : ''}
        ${!isVisionGoal && !isPillarGoal ? 'text-[11px] lg:text-sm' : ''}
        ${isInTree ? 'mb-1 lg:mb-2' : 'mb-2'}
      `}>
        {goal.title || goal.goal_text?.substring(0, 60) || 'Untitled'}
      </div>

      {isStarterExample && (
        <div className="mb-2 inline-flex rounded-full border border-slate-300 bg-slate-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
          Example goal
        </div>
      )}
      
      {/* Footer with horizon and tasks */}
      <div className={`
        flex items-center justify-between
        ${isInTree ? 'text-[10px] lg:text-xs' : 'text-xs lg:text-xs'}
        ${isVisionGoal ? 'lg:pt-2 lg:border-t lg:border-slate-200' : ''}
      `}>
        <span className={`
          text-slate-600
          ${isVisionGoal ? 'lg:font-medium' : ''}
        `}>
          {getGoalLevelLabel(goal.time_horizon)}
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
