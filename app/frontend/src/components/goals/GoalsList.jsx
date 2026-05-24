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
    const visionGoals = goals.vision || [];
    
    return visionGoals.map(vision => {
      const pillarChildren = (goals.pillar || []).filter(g => g.parent_goal_id === vision.id);
      
      return {
        ...vision,
        children: pillarChildren.map(pillar => ({
          ...pillar,
          children: (goals.outcome || []).filter(g => g.parent_goal_id === pillar.id)
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

    if (source.droppableId === 'vision-goals') {
      const orderedGoals = reorder(tree, source.index, destination.index);
      onReorderGoals({ goalType: 'vision', orderedGoals });
      return;
    }

    if (source.droppableId.startsWith('pillar-goals-')) {
      const visionGoalId = Number(source.droppableId.replace('pillar-goals-', ''));
      const visionGoal = tree.find(goal => goal.id === visionGoalId);
      if (!visionGoal) return;

      const orderedGoals = reorder(visionGoal.children || [], source.index, destination.index);
      onReorderGoals({
        parentId: visionGoalId,
        goalType: 'pillar',
        orderedGoals
      });
      return;
    }

    if (source.droppableId.startsWith('outcome-goals-')) {
      const pillarGoalId = Number(source.droppableId.replace('outcome-goals-', ''));
      const pillarGoal = tree
        .flatMap(goal => goal.children || [])
        .find(goal => goal.id === pillarGoalId);
      if (!pillarGoal) return;

      const orderedGoals = reorder(pillarGoal.children || [], source.index, destination.index);
      onReorderGoals({
        parentId: pillarGoalId,
        goalType: 'outcome',
        orderedGoals
      });
    }
  };

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
    <div className="space-y-1 lg:space-y-4">
      {tree.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-slate-500">No visions yet</p>
        </div>
      ) : expandedGoalId ? (
        tree.map(vision => {
          const isExpanded = expandedGoalId === vision.id;
          const hasChildren = vision.children && vision.children.length > 0;
          
          if (!isExpanded) {
            return null;
          }
          
          return (
            <div key={vision.id}>
              <div className="border border-blue-300 rounded p-1.5 lg:p-6 lg:rounded-xl bg-blue-50/20 lg:bg-blue-50/30">
                {/* Vision in tree */}
                <div className="mb-2 lg:mb-6">
                  <GoalCard
                    goal={vision}
                    onClick={onCardClick}
                    taskCount={taskCounts[vision.id] || 0}
                    isInTree={true}
                  />
                </div>

                {/* Pillars - responsive grid */}
                {hasChildren && (
                  <Droppable droppableId={`pillar-goals-${vision.id}`} direction="horizontal">
                    {(provided) => (
                      <div
                        {...provided.droppableProps}
                        ref={provided.innerRef}
                        className="grid gap-1.5 lg:gap-4"
                        style={{ gridTemplateColumns: `repeat(${vision.children.length}, 1fr)` }}
                      >
                        {vision.children.map((pillar, index) => {
                          const hasOutcomeChildren = pillar.children && pillar.children.length > 0;

                          return (
                            <Draggable
                              key={pillar.id}
                              draggableId={String(pillar.id)}
                              index={index}
                            >
                              {(provided, snapshot) => (
                                <div
                                  ref={provided.innerRef}
                                  {...provided.draggableProps}
                                  style={provided.draggableProps.style}
                                >
                                  {!hasOutcomeChildren ? (
                                    <GoalCard 
                                      goal={pillar}
                                      onClick={onCardClick}
                                      onEdit={onEditClick}
                                      taskCount={taskCounts[pillar.id] || 0}
                                      isInTree={true}
                                      dragHandleProps={provided.dragHandleProps}
                                      isDragging={snapshot.isDragging || recentlyDraggedId === String(pillar.id)}
                                    />
                                  ) : (
                                    <div className={`border border-slate-300 rounded p-1.5 lg:p-4 lg:rounded-lg bg-white ${snapshot.isDragging ? 'shadow-lg ring-2 ring-blue-300' : ''}`}>
                                      {/* Pillar */}
                                      <div className="mb-1.5 lg:mb-4">
                                        <GoalCard
                                          goal={pillar}
                                          onClick={onCardClick}
                                          onEdit={onEditClick}
                                          taskCount={taskCounts[pillar.id] || 0}
                                          isInTree={true}
                                          dragHandleProps={provided.dragHandleProps}
                                          isDragging={snapshot.isDragging || recentlyDraggedId === String(pillar.id)}
                                        />
                                      </div>

                                      {/* Outcomes - aligned right edge, indented left */}
                                      <Droppable droppableId={`outcome-goals-${pillar.id}`}>
                                        {(provided) => (
                                          <div
                                            {...provided.droppableProps}
                                            ref={provided.innerRef}
                                            className="space-y-1.5 lg:space-y-3 pl-2 lg:pl-8 border-l border-slate-200 lg:border-l-2"
                                          >
                                            {pillar.children.map((outcome, index) => (
                                              <Draggable
                                                key={outcome.id}
                                                draggableId={String(outcome.id)}
                                                index={index}
                                              >
                                                {(provided, snapshot) => (
                                                  <div
                                                    ref={provided.innerRef}
                                                    {...provided.draggableProps}
                                                    style={provided.draggableProps.style}
                                                  >
                                                    <GoalCard
                                                      goal={outcome}
                                                      onClick={onCardClick}
                                                      taskCount={taskCounts[outcome.id] || 0}
                                                      isInTree={true}
                                                      dragHandleProps={provided.dragHandleProps}
                                                      isDragging={snapshot.isDragging || recentlyDraggedId === String(outcome.id)}
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
        <Droppable droppableId="vision-goals">
          {(provided) => (
            <div
              {...provided.droppableProps}
              ref={provided.innerRef}
              className="space-y-1 lg:space-y-4"
            >
              {tree.map((vision, index) => (
                <Draggable
                  key={vision.id}
                  draggableId={String(vision.id)}
                  index={index}
                >
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.draggableProps}
                      style={provided.draggableProps.style}
                    >
                      <GoalCard
                        goal={vision}
                        onClick={onCardClick}
                        onEdit={onEditClick}
                        taskCount={taskCounts[vision.id] || 0}
                        isInTree={false}
                        dragHandleProps={provided.dragHandleProps}
                        isDragging={snapshot.isDragging || recentlyDraggedId === String(vision.id)}
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
