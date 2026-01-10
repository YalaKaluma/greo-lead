/* =========================================================
   GOAL TREE COMPONENT
   Shows hierarchical structure: Parent → Children → Grandchildren
   ========================================================= */

const GoalTreeNode = ({ goal, level = 0, isLast = false, isParent = false, onChildClick }) => {
  const indent = level * 24; // 24px per level
  
  return (
    <div className="relative">
      {/* Connecting lines */}
      {level > 0 && (
        <>
          {/* Horizontal line */}
          <div 
            className="absolute border-t-2 border-slate-300"
            style={{
              left: `${indent - 24}px`,
              top: '20px',
              width: '24px'
            }}
          />
          {/* Vertical line (if not last child) */}
          {!isLast && (
            <div 
              className="absolute border-l-2 border-slate-300"
              style={{
                left: `${indent - 24}px`,
                top: '20px',
                bottom: '-20px'
              }}
            />
          )}
        </>
      )}
      
      {/* Goal node */}
      <div 
        onClick={() => !isParent && onChildClick && onChildClick(goal)}
        className={`flex items-start gap-3 py-2 px-3 rounded-lg mb-2 ${
          isParent 
            ? 'bg-blue-50 border-2 border-blue-300' 
            : 'bg-white border border-slate-200 hover:border-slate-400 cursor-pointer'
        }`}
        style={{ marginLeft: `${indent}px` }}
      >
        {/* Level indicator */}
        <div className="flex-shrink-0 mt-1">
          {level === 0 && <span className="text-blue-600 font-bold">●</span>}
          {level === 1 && <span className="text-slate-600">○</span>}
          {level === 2 && <span className="text-slate-400">◦</span>}
        </div>
        
        {/* Goal content */}
        <div className="flex-1 min-w-0">
          <div className={`font-medium ${isParent ? 'text-blue-900' : 'text-slate-800'}`}>
            {goal.title || goal.goal_text?.substring(0, 60) || 'Untitled Goal'}
          </div>
          
          {goal.goal_text && goal.title && (
            <div className="text-sm text-slate-600 mt-1 line-clamp-2">
              {goal.goal_text}
            </div>
          )}
          
          {/* Time horizon badge */}
          <div className="mt-2">
            <span className="text-xs px-2 py-1 rounded bg-slate-100 text-slate-600">
              {goal.time_horizon === 'long' ? 'Long Term' : 
               goal.time_horizon === 'medium' ? 'Medium Term' : 'Short Term'}
            </span>
          </div>
        </div>
        
        {/* Arrow indicator for clickable children */}
        {!isParent && (
          <div className="flex-shrink-0 text-slate-400">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        )}
      </div>
    </div>
  );
};

/* =========================================================
   MAIN TREE COMPONENT
   ========================================================= */

export default function GoalTree({ parentGoal, allGoals, onChildClick }) {
  // Find all children of the parent goal
  const findChildren = (goalId) => {
    return allGoals.filter(g => g.parent_goal_id === goalId);
  };
  
  // Recursive function to build tree
  const renderTree = (goal, level = 0, isLast = false, isParent = false) => {
    const children = findChildren(goal.id);
    
    return (
      <div key={goal.id}>
        <GoalTreeNode 
          goal={goal} 
          level={level} 
          isLast={isLast && children.length === 0}
          isParent={isParent}
          onChildClick={onChildClick}
        />
        
        {/* Render children */}
        {children.length > 0 && (
          <div className="ml-0">
            {children.map((child, index) => 
              renderTree(
                child, 
                level + 1, 
                index === children.length - 1,
                false
              )
            )}
          </div>
        )}
      </div>
    );
  };
  
  return (
    <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
      <div className="mb-4 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-slate-700 uppercase tracking-wider">
          Goal Breakdown
        </h4>
        <p className="text-xs text-slate-500">Click any child goal to view/edit details</p>
      </div>
      
      {renderTree(parentGoal, 0, false, true)}
      
      {/* Empty state if no children */}
      {findChildren(parentGoal.id).length === 0 && (
        <div className="text-center py-4 text-sm text-slate-500 border-t border-slate-200 mt-4">
          No breakdown yet. This long-term goal needs medium-term milestones.
        </div>
      )}
    </div>
  );
}
