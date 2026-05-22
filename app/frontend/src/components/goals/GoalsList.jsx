import GoalCard from './GoalCard';
import { useState } from 'react';
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';

//Old version
//export default function GoalsList({ goals, onCardClick, expandedGoalId, taskCounts = {} }) {


export default function GoalsList({ 
  goals,
  onCardClick,
  onEditClick,
  onReorderGoals,
  expandedGoalId,
  taskCounts = {}
}) {
  const [recentlyDraggedId, setRecentlyDraggedId] = useState(null);
  
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

  const reorder = (items, sourceIndex, destinationIndex) => {
    const nextItems = Array.from(items);
    const [movedItem] = nextItems.splice(sourceIndex, 1);
    nextItems.splice(destinationIndex, 0, movedItem);
    return nextItems;
  };

  const handleDragEnd = (result) => {
    const { source, destination } = result;
    setRecentlyDraggedId(result.draggableId);
    window.setTimeout(() => setRecentlyDraggedId(null), 150);

    if (!destination) return;
    if (
      source.droppableId === destination.droppableId &&
      source.index === destination.index
    ) {
      return;
    }

    if (source.droppableId !== destination.droppableId) {
      return;
    }

    if (source.droppableId === 'long-goals') {
      const orderedGoals = reorder(tree, source.index, destination.index);
      onReorderGoals({ goalType: 'long_term', orderedGoals });
      return;
    }

    if (source.droppableId.startsWith('medium-goals-')) {
      const longTermGoalId = Number(source.droppableId.replace('medium-goals-', ''));
      const longTermGoal = tree.find(goal => goal.id === longTermGoalId);
      if (!longTermGoal) return;

      const orderedGoals = reorder(longTermGoal.children || [], source.index, destination.index);
      onReorderGoals({
        parentId: longTermGoalId,
        goalType: 'medium_term',
        orderedGoals
      });
      return;
    }

    if (source.droppableId.startsWith('short-goals-')) {
      const mediumTermGoalId = Number(source.droppableId.replace('short-goals-', ''));
      const mediumTermGoal = tree
        .flatMap(goal => goal.children || [])
        .find(goal => goal.id === mediumTermGoalId);
      if (!mediumTermGoal) return;

      const orderedGoals = reorder(mediumTermGoal.children || [], source.index, destination.index);
      onReorderGoals({
        parentId: mediumTermGoalId,
        goalType: 'short_term',
        orderedGoals
      });
    }
  };

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
    <div className="space-y-1 lg:space-y-4">
      {tree.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-slate-500">No goals yet</p>
        </div>
      ) : expandedGoalId ? (
        tree.map(ltGoal => {
          const isExpanded = expandedGoalId === ltGoal.id;
          const hasChildren = ltGoal.children && ltGoal.children.length > 0;
          
          if (!isExpanded) {
            return null;
          }
          
          return (
            <div key={ltGoal.id}>
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
                  <Droppable droppableId={`medium-goals-${ltGoal.id}`} direction="horizontal">
                    {(provided) => (
                      <div
                        {...provided.droppableProps}
                        ref={provided.innerRef}
                        className="grid gap-1.5 lg:gap-4"
                        style={{ gridTemplateColumns: `repeat(${ltGoal.children.length}, 1fr)` }}
                      >
                        {ltGoal.children.map((mtGoal, index) => {
                          const hasSTChildren = mtGoal.children && mtGoal.children.length > 0;

                          return (
                            <Draggable
                              key={mtGoal.id}
                              draggableId={String(mtGoal.id)}
                              index={index}
                            >
                              {(provided, snapshot) => (
                                <div
                                  ref={provided.innerRef}
                                  {...provided.draggableProps}
                                  style={provided.draggableProps.style}
                                >
                                  {!hasSTChildren ? (
                                    <GoalCard 
                                      goal={mtGoal}
                                      onClick={onCardClick}
                                      onEdit={onEditClick}
                                      taskCount={taskCounts[mtGoal.id] || 0}
                                      isInTree={true}
                                      dragHandleProps={provided.dragHandleProps}
                                      isDragging={snapshot.isDragging || recentlyDraggedId === String(mtGoal.id)}
                                    />
                                  ) : (
                                    <div className={`border border-slate-300 rounded p-1.5 lg:p-4 lg:rounded-lg bg-white ${snapshot.isDragging ? 'shadow-lg ring-2 ring-blue-300' : ''}`}>
                                      {/* MT GOAL */}
                                      <div className="mb-1.5 lg:mb-4">
                                        <GoalCard
                                          goal={mtGoal}
                                          onClick={onCardClick}
                                          onEdit={onEditClick}
                                          taskCount={taskCounts[mtGoal.id] || 0}
                                          isInTree={true}
                                          dragHandleProps={provided.dragHandleProps}
                                          isDragging={snapshot.isDragging || recentlyDraggedId === String(mtGoal.id)}
                                        />
                                      </div>

                                      {/* ST GOALS - aligned right edge, indented left */}
                                      <Droppable droppableId={`short-goals-${mtGoal.id}`}>
                                        {(provided) => (
                                          <div
                                            {...provided.droppableProps}
                                            ref={provided.innerRef}
                                            className="space-y-1.5 lg:space-y-3 pl-2 lg:pl-8 border-l border-slate-200 lg:border-l-2"
                                          >
                                            {mtGoal.children.map((stGoal, index) => (
                                              <Draggable
                                                key={stGoal.id}
                                                draggableId={String(stGoal.id)}
                                                index={index}
                                              >
                                                {(provided, snapshot) => (
                                                  <div
                                                    ref={provided.innerRef}
                                                    {...provided.draggableProps}
                                                    style={provided.draggableProps.style}
                                                  >
                                                    <GoalCard
                                                      goal={stGoal}
                                                      onClick={onCardClick}
                                                      taskCount={taskCounts[stGoal.id] || 0}
                                                      isInTree={true}
                                                      dragHandleProps={provided.dragHandleProps}
                                                      isDragging={snapshot.isDragging || recentlyDraggedId === String(stGoal.id)}
                                                    />
                                                  </div>
                                                )}
                                              </Draggable>
                                            ))}
                                            {provided.placeholder}
                                          </div>
                                        )}
                                      </Droppable>
                                    </div>
                                  )}
                                </div>
                              )}
                            </Draggable>
                          );
                        })}
                        {provided.placeholder}
                      </div>
                    )}
                  </Droppable>
                )}
              </div>
            </div>
          );
        })
      ) : (
        <Droppable droppableId="long-goals">
          {(provided) => (
            <div
              {...provided.droppableProps}
              ref={provided.innerRef}
              className="space-y-1 lg:space-y-4"
            >
              {tree.map((ltGoal, index) => (
                <Draggable
                  key={ltGoal.id}
                  draggableId={String(ltGoal.id)}
                  index={index}
                >
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.draggableProps}
                      style={provided.draggableProps.style}
                    >
                      <GoalCard
                        goal={ltGoal}
                        onClick={onCardClick}
                        onEdit={onEditClick}
                        taskCount={taskCounts[ltGoal.id] || 0}
                        isInTree={false}
                        dragHandleProps={provided.dragHandleProps}
                        isDragging={snapshot.isDragging || recentlyDraggedId === String(ltGoal.id)}
                      />
                    </div>
                  )}
                </Draggable>
              ))}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      )}
    </div>
    </DragDropContext>
  );
}
