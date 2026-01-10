import GoalCard from './GoalCard';

/* =========================================================
   MAIN COMPONENT - TRUE VISUAL TREE
   ========================================================= */

export default function GoalsList({ goals, onCardClick, allGoals, expandedGoalId, taskCounts = {} }) {
  
  // Build hierarchical structure
  const buildTree = () => {
    const longTermGoals = goals.long || [];
    
    return longTermGoals.map(ltGoal => {
      // Find medium term children
      const mediumChildren = (goals.medium || []).filter(g => g.parent_goal_id === ltGoal.id);
      
      return {
        ...ltGoal,
        children: mediumChildren.map(mtGoal => ({
          ...mtGoal,
          // Find short term children
          children: (goals.short || []).filter(g => g.parent_goal_id === mtGoal.id)
        }))
      };
    });
  };

  const tree = buildTree();

  return (
    <div className="space-y-12">
      {tree.length === 0 ? (
        /* Empty state */
        <div className="text-center py-12">
          <div className="text-slate-400 mb-4">
            <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <p className="text-slate-500 text-lg">No long term goals yet</p>
          <p className="text-slate-400 text-sm mt-1">Click "+ Add Goal" to get started</p>
        </div>
      ) : (
        tree.map(ltGoal => {
          const isExpanded = expandedGoalId === ltGoal.id;
          const hasChildren = ltGoal.children && ltGoal.children.length > 0;
          
          return (
            <div key={ltGoal.id} className="space-y-8">
              {/* LONG TERM GOAL */}
              <div>
                <GoalCard 
                  goal={ltGoal}
                  onClick={onCardClick}
                  hasChildren={hasChildren}
                  taskCount={taskCounts[ltGoal.id] || 0}
                />
              </div>

              {/* EXPANDED TREE */}
              {isExpanded && hasChildren && (
                <div className="relative">
                  {/* Vertical line from LT goal down */}
                  <div className="absolute left-1/2 top-0 w-0.5 h-8 bg-slate-300 -translate-x-1/2" />
                  
                  <div className="pt-8">
                    {/* MEDIUM TERM LABEL */}
                    <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">
                      Medium Term
                    </div>
                    
                    {/* MEDIUM TERM GOALS IN A ROW */}
                    <div className="relative">
                      {/* Horizontal line connecting all MT goals */}
                      {ltGoal.children.length > 1 && (
                        <div className="absolute top-0 left-0 right-0 h-0.5 bg-slate-300" 
                             style={{ 
                               left: `calc(50% / ${ltGoal.children.length})`,
                               right: `calc(50% / ${ltGoal.children.length})`,
                               top: '-16px'
                             }} 
                        />
                      )}
                      
                      <div className="grid gap-4" 
                           style={{ 
                             gridTemplateColumns: `repeat(${ltGoal.children.length}, 1fr)` 
                           }}>
                        {ltGoal.children.map((mtGoal, mtIndex) => {
                          const hasSTChildren = mtGoal.children && mtGoal.children.length > 0;
                          
                          return (
                            <div key={mtGoal.id} className="relative">
                              {/* Vertical line down from horizontal connector */}
                              {ltGoal.children.length > 1 && (
                                <div className="absolute left-1/2 -top-4 w-0.5 h-4 bg-slate-300 -translate-x-1/2" />
                              )}
                              
                              {/* MEDIUM TERM GOAL */}
                              <GoalCard 
                                goal={mtGoal}
                                onClick={onCardClick}
                                hasChildren={hasSTChildren}
                                taskCount={taskCounts[mtGoal.id] || 0}
                              />
                              
                              {/* SHORT TERM GOALS UNDERNEATH THIS MT GOAL */}
                              {hasSTChildren && (
                                <div className="mt-6 space-y-6">
                                  {/* Vertical line from MT goal down */}
                                  <div className="absolute left-1/2 bottom-0 w-0.5 h-6 bg-slate-300 -translate-x-1/2 translate-y-full" />
                                  
                                  {/* SHORT TERM LABEL */}
                                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 text-center">
                                    Short Term
                                  </div>
                                  
                                  {/* SHORT TERM GOALS */}
                                  <div className="space-y-3">
                                    {mtGoal.children.map((stGoal, stIndex) => {
                                      const isFirst = stIndex === 0;
                                      
                                      return (
                                        <div key={stGoal.id} className="relative">
                                          {/* Connecting line to parent */}
                                          {isFirst && (
                                            <div className="absolute left-1/2 -top-3 w-0.5 h-3 bg-slate-300 -translate-x-1/2" />
                                          )}
                                          
                                          <GoalCard 
                                            goal={stGoal}
                                            onClick={onCardClick}
                                            taskCount={taskCounts[stGoal.id] || 0}
                                          />
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
