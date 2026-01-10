import GoalCard from './GoalCard';

/* =========================================================
   MAIN COMPONENT - CONTAINER-BASED TREE
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
    <div className="space-y-6">
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
          
          // Hide this LT goal if another one is expanded
          if (expandedGoalId && expandedGoalId !== ltGoal.id) {
            return null;
          }
          
          return (
            <div key={ltGoal.id}>
              {!isExpanded ? (
                /* Collapsed view - just the LT goal */
                <GoalCard 
                  goal={ltGoal}
                  onClick={onCardClick}
                  hasChildren={hasChildren}
                  taskCount={taskCounts[ltGoal.id] || 0}
                />
              ) : (
                /* Expanded view - LT goal with container around children */
                <div className="border-2 border-blue-200 rounded-xl p-6 bg-blue-50/30">
                  {/* LONG TERM GOAL at top */}
                  <div className="mb-6">
                    <GoalCard 
                      goal={ltGoal}
                      onClick={onCardClick}
                      hasChildren={hasChildren}
                      taskCount={taskCounts[ltGoal.id] || 0}
                    />
                  </div>

                  {/* MEDIUM TERM GOALS IN A ROW */}
                  {hasChildren && (
                    <div 
                      className="grid gap-4" 
                      style={{ 
                        gridTemplateColumns: `repeat(${ltGoal.children.length}, 1fr)` 
                      }}
                    >
                      {ltGoal.children.map((mtGoal) => {
                        const hasSTChildren = mtGoal.children && mtGoal.children.length > 0;
                        
                        return (
                          <div key={mtGoal.id}>
                            {!hasSTChildren ? (
                              /* MT goal without children - just the card */
                              <GoalCard 
                                goal={mtGoal}
                                onClick={onCardClick}
                                hasChildren={false}
                                taskCount={taskCounts[mtGoal.id] || 0}
                              />
                            ) : (
                              /* MT goal with container around ST children */
                              <div className="border-2 border-slate-300 rounded-lg p-4 bg-white">
                                {/* MEDIUM TERM GOAL */}
                                <div className="mb-4">
                                  <GoalCard 
                                    goal={mtGoal}
                                    onClick={onCardClick}
                                    hasChildren={true}
                                    taskCount={taskCounts[mtGoal.id] || 0}
                                  />
                                </div>
                                
                                {/* SHORT TERM GOALS stacked vertically */}
                                <div className="space-y-3 pl-4 border-l-2 border-slate-200">
                                  {mtGoal.children.map((stGoal) => (
                                    <GoalCard 
                                      key={stGoal.id}
                                      goal={stGoal}
                                      onClick={onCardClick}
                                      taskCount={taskCounts[stGoal.id] || 0}
                                    />
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
