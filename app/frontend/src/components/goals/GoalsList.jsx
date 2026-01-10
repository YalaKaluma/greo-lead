import { useState } from 'react';
import GoalCard from './GoalCard';

export default function GoalsList({ goals, onCardClick, expandedGoalId, taskCounts = {}, onReorderGoals }) {
  
  const [draggedGoal, setDraggedGoal] = useState(null);
  const [dragOverGoal, setDragOverGoal] = useState(null);
  
  const buildTree = () => {
    const longTermGoals = goals.long || [];
    
    return longTermGoals.map(ltGoal => {
      const mediumChildren = (goals.medium || []).filter(g => g.parent_goal_id === ltGoal.id)
        .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
      
      return {
        ...ltGoal,
        children: mediumChildren.map(mtGoal => ({
          ...mtGoal,
          children: (goals.short || []).filter(g => g.parent_goal_id === mtGoal.id)
            .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
        }))
      };
    });
  };

  const tree = buildTree();

  // Drag handlers
  const handleDragStart = (e, goal) => {
    setDraggedGoal(goal);
  };

  const handleDragEnd = () => {
    setDraggedGoal(null);
    setDragOverGoal(null);
  };

  const handleDragOver = (e, goal) => {
    e.preventDefault();
    setDragOverGoal(goal);
  };

  const handleDrop = (e, targetGoal) => {
    e.preventDefault();
    
    if (!draggedGoal || draggedGoal.id === targetGoal.id) {
      handleDragEnd();
      return;
    }

    // Can only reorder within same parent and time horizon
    if (draggedGoal.parent_goal_id !== targetGoal.parent_goal_id || 
        draggedGoal.time_horizon !== targetGoal.time_horizon) {
      handleDragEnd();
      return;
    }

    // Get all goals in the same group
    const sameGroup = [...goals[draggedGoal.time_horizon]].filter(g => 
      g.parent_goal_id === draggedGoal.parent_goal_id
    ).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

    // Find indices
    const draggedIndex = sameGroup.findIndex(g => g.id === draggedGoal.id);
    const targetIndex = sameGroup.findIndex(g => g.id === targetGoal.id);

    if (draggedIndex === targetIndex) {
      handleDragEnd();
      return;
    }

    // Reorder
    const reordered = [...sameGroup];
    const [removed] = reordered.splice(draggedIndex, 1);
    reordered.splice(targetIndex, 0, removed);

    // Update sort_order for all affected goals
    const updates = reordered.map((goal, index) => ({
      id: goal.id,
      sort_order: index
    }));

    // Call parent to update
    if (onReorderGoals) {
      onReorderGoals(updates);
    }

    handleDragEnd();
  };

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
                                taskCount={taskCounts[mtGoal.id] || 0}
                                isInTree={true}
                              />
                            ) : (
                              <div className="border border-slate-300 rounded p-1.5 lg:p-4 lg:rounded-lg bg-white">
                                {/* MT GOAL - draggable */}
                                <div className="mb-1.5 lg:mb-4">
                                  <GoalCard 
                                    goal={mtGoal}
                                    onClick={onCardClick}
                                    taskCount={taskCounts[mtGoal.id] || 0}
                                    isInTree={true}
                                    draggable={true}
                                    onDragStart={handleDragStart}
                                    onDragEnd={handleDragEnd}
                                    onDragOver={handleDragOver}
                                    onDrop={handleDrop}
                                    isDragging={draggedGoal?.id === mtGoal.id}
                                  />
                                </div>
                                
                                {/* ST GOALS - aligned right edge, indented left, draggable */}
                                <div className="space-y-1.5 lg:space-y-3 pl-2 lg:pl-8 border-l border-slate-200 lg:border-l-2">
                                  {mtGoal.children.map((stGoal) => (
                                    <GoalCard 
                                      key={stGoal.id}
                                      goal={stGoal}
                                      onClick={onCardClick}
                                      taskCount={taskCounts[stGoal.id] || 0}
                                      isInTree={true}
                                      draggable={true}
                                      onDragStart={handleDragStart}
                                      onDragEnd={handleDragEnd}
                                      onDragOver={handleDragOver}
                                      onDrop={handleDrop}
                                      isDragging={draggedGoal?.id === stGoal.id}
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
