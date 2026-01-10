/* =========================================================
   GOAL TREE COMPONENT
   Shows hierarchical structure: Parent → Children → Grandchildren
   ========================================================= */

const GoalTreeNode = ({ goal, level = 0, isLast = false, isParent = false }) => {
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
        className={`flex items-start gap-3 py-2 px-3 rounded-lg mb-2 ${
          isParent 
            ? 'bg-blue-50 border-2 border-blue-300' 
            : 'bg-white border border-slate-200'
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
      </div>
    </div>
  );
};

/* =========================================================
   MAIN TREE COMPONENT
   ========================================================= */

export default function GoalTree({ parentGoal, allGoals }) {
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
      <div className="mb-4">
        <h4 className="text-sm font-semibold text-slate-700 uppercase tracking-wider">
          Goal Hierarchy
        </h4>
      </div>
      
      {renderTree(parentGoal, 0, false, true)}
      
      {/* Empty state if no children */}
      {findChildren(parentGoal.id).length === 0 && (
        <div className="text-center py-4 text-sm text-slate-500 border-t border-slate-200 mt-4">
          No child goals yet. Click "Create Child Goal" to break this down into smaller steps.
        </div>
      )}
    </div>
  );
}
