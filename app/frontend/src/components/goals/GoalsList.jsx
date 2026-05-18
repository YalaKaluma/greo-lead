import GoalCard from './GoalCard';

//Old version
//export default function GoalsList({ goals, onCardClick, expandedGoalId, taskCounts = {} }) {


export default function GoalsList({ 
  goals,
  onCardClick,
  onEditClick,
  expandedGoalId,
  taskCounts = {}
}) {
  
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
    <div className="space-y-1 lg:space-y-4">
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
                /* Main page - larger LT goals */
                <GoalCard 
                  goal={ltGoal}
                  onClick={onCardClick}
                  onEdit={onEditClick}
                  taskCount={taskCounts[ltGoal.id] || 0}
                  isInTree={false}
                />
              ) : (
                /* Expanded tree - all cards in tree mode */
                <div className="border border-blue-300 rounded p-1.5 lg:p-6 lg:rounded-xl bg-blue-50/20 lg:bg-blue-50/30">
                  {/* LT GOAL in tree */}
                  <div className="mb-2 lg:mb-6">
                    <GoalCard 
                      goal={ltGoal}
                      onClick={onCardClick}
                      taskCount={taskCounts[ltGoal.id] || 0}
                      isInTree={true}
                    />
                  </div>

                  {/* MT GOALS - responsive grid */}
                  {hasChildren && (
                    <div 
                      className="grid gap-1.5 lg:gap-4"
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
                                onEdit={onEditClick}
                                taskCount={taskCounts[mtGoal.id] || 0}
                                isInTree={true}
                              />
                            ) : (
                              <div className="border border-slate-300 rounded p-1.5 lg:p-4 lg:rounded-lg bg-white">
                                {/* MT GOAL */}
                                <div className="mb-1.5 lg:mb-4">
                                  <GoalCard 
                                    goal={mtGoal}
                                    onClick={onCardClick}
                                    onEdit={onEditClick}
                                    taskCount={taskCounts[mtGoal.id] || 0}
                                    isInTree={true}
                                  />
                                </div>
                                
                                {/* ST GOALS - aligned right edge, indented left */}
                                <div className="space-y-1.5 lg:space-y-3 pl-2 lg:pl-8 border-l border-slate-200 lg:border-l-2">
                                  {mtGoal.children.map((stGoal) => (
                                    <GoalCard 
                                      key={stGoal.id}
                                      goal={stGoal}
                                      onClick={onCardClick}
                                      taskCount={taskCounts[stGoal.id] || 0}
                                      isInTree={true}
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
