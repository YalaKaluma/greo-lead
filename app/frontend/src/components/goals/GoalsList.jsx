import GoalCard from './GoalCard';

/* =========================================================
   MAIN COMPONENT - TRUE TREE STRUCTURE
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
    <div className="space-y-8">
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
            <div key={ltGoal.id} className="mb-8">
              {/* Long Term Goal */}
              <div className="mb-6">
                <GoalCard 
                  goal={ltGoal}
                  onClick={onCardClick}
                  hasChildren={hasChildren}
                  taskCount={taskCounts[ltGoal.id] || 0}
                />
              </div>

              {/* Expanded Tree View */}
              {isExpanded && hasChildren && (
                <div className="ml-8 pl-8 border-l-2 border-slate-300">
                  {ltGoal.children.map((mtGoal, mtIndex) => {
                    const hasSTChildren = mtGoal.children && mtGoal.children.length > 0;
                    
                    return (
                      <div key={mtGoal.id} className="relative mb-6">
                        {/* Horizontal connector line */}
                        <div className="absolute left-0 top-6 w-8 border-t-2 border-slate-300" 
                             style={{ transform: 'translateX(-32px)' }} />
                        
                        {/* Medium Term Goal */}
                        <div className="mb-4">
                          <GoalCard 
                            goal={mtGoal}
                            onClick={onCardClick}
                            hasChildren={hasSTChildren}
                            taskCount={taskCounts[mtGoal.id] || 0}
                          />
                        </div>

                        {/* Short Term Goals */}
                        {hasSTChildren && (
                          <div className="ml-8 pl-8 border-l-2 border-slate-300">
                            {mtGoal.children.map((stGoal, stIndex) => {
                              return (
                                <div key={stGoal.id} className="relative mb-4">
                                  {/* Horizontal connector line */}
                                  <div className="absolute left-0 top-6 w-8 border-t-2 border-slate-300" 
                                       style={{ transform: 'translateX(-32px)' }} />
                                  
                                  {/* Short Term Goal */}
                                  <GoalCard 
                                    goal={stGoal}
                                    onClick={onCardClick}
                                    taskCount={taskCounts[stGoal.id] || 0}
                                  />
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
