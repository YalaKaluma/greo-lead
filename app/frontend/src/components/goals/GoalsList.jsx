import GoalCard from './GoalCard';

export default function GoalsList({ goals, onCardClick, expandedGoalId, taskCounts = {} }) {
  
  const buildTree = () => {
    const longTermGoals = goals.long || [];
    
    return longTermGoals.map(ltGoal => {
      const mediumChildren = (goals.medium || []).filter(g => g.parent_goal_id === ltGoal.id);
      
      return {
        ...ltGoal,
        children: mediumChildren.map(mtGoal => ({
          ...mtGoal,
          children: (goals.short || []).filter(g => g.parent_goal_id === mtGoal.id)
        }))
      };
    });
  };

  const tree = buildTree();

  return (
    <div className="space-y-1">
      {tree.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-slate-500">No goals yet</p>
        </div>
      ) : (
        tree.map(ltGoal => {
          const isExpanded = expandedGoalId === ltGoal.id;
          const hasChildren = ltGoal.children && ltGoal.children.length > 0;
          
          if (expandedGoalId && expandedGoalId !== ltGoal.id) {
            return null;
          }
          
          return (
            <div key={ltGoal.id}>
              {!isExpanded ? (
                <GoalCard 
                  goal={ltGoal}
                  onClick={onCardClick}
                  taskCount={taskCounts[ltGoal.id] || 0}
                />
              ) : (
                /* Expanded - ultra compact */
                <div className="border border-blue-300 rounded p-1 bg-blue-50/20">
                  {/* LT GOAL */}
                  <div className="mb-1">
                    <GoalCard 
                      goal={ltGoal}
                      onClick={onCardClick}
                      taskCount={taskCounts[ltGoal.id] || 0}
                    />
                  </div>

                  {/* MT GOALS */}
                  {hasChildren && (
                    <div 
                      className="grid gap-1"
                      style={{ gridTemplateColumns: `repeat(${ltGoal.children.length}, 1fr)` }}
                    >
                      {ltGoal.children.map((mtGoal) => {
                        const hasSTChildren = mtGoal.children && mtGoal.children.length > 0;
                        
                        return (
                          <div key={mtGoal.id}>
                            {!hasSTChildren ? (
                              <GoalCard 
                                goal={mtGoal}
                                onClick={onCardClick}
                                taskCount={taskCounts[mtGoal.id] || 0}
                              />
                            ) : (
                              <div className="border border-slate-300 rounded p-1 bg-white">
                                {/* MT GOAL */}
                                <div className="mb-1">
                                  <GoalCard 
                                    goal={mtGoal}
                                    onClick={onCardClick}
                                    taskCount={taskCounts[mtGoal.id] || 0}
                                  />
                                </div>
                                
                                {/* ST GOALS - narrower than MT */}
                                <div className="space-y-1 pl-1 border-l border-slate-200">
                                  {mtGoal.children.map((stGoal) => (
                                    <div key={stGoal.id} className="w-[90%]">
                                      <GoalCard 
                                        goal={stGoal}
                                        onClick={onCardClick}
                                        taskCount={taskCounts[stGoal.id] || 0}
                                      />
                                    </div>
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
