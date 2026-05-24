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
  onMoveGoalAcrossParents,
  onCreateChildGoal,
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

  const AddOutcomeButton = ({ pillarId }) => (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onCreateChildGoal?.(pillarId);
      }}
      className="mt-2 h-8 w-8 rounded-full border border-slate-300 hover:border-blue-500 hover:text-blue-600 text-slate-600 text-lg leading-none"
      aria-label="Add outcome"
      title="Add outcome"
    >
      +
    </button>
  );

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

    if (source.droppableId === 'vision-goals') {
      const orderedGoals = reorder(tree, source.index, destination.index);
      onReorderGoals({ goalType: 'vision', orderedGoals });
      return;
    }

    if (source.droppableId.startsWith('pillar-goals-')) {
      if (source.droppableId !== destination.droppableId) return;

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
      if (!destination.droppableId.startsWith('outcome-goals-')) return;

      const sourcePillarGoalId = Number(source.droppableId.replace('outcome-goals-', ''));
      const destinationPillarGoalId = Number(destination.droppableId.replace('outcome-goals-', ''));
      const allPillars = tree.flatMap(goal => goal.children || []);
      const sourcePillarGoal = allPillars.find(goal => goal.id === sourcePillarGoalId);
      const destinationPillarGoal = allPillars.find(goal => goal.id === destinationPillarGoalId);
      if (!sourcePillarGoal || !destinationPillarGoal) return;

      if (sourcePillarGoalId === destinationPillarGoalId) {
        const orderedGoals = reorder(sourcePillarGoal.children || [], source.index, destination.index);
        onReorderGoals({
          parentId: sourcePillarGoalId,
          goalType: 'outcome',
          orderedGoals
        });
        return;
      }

      const sourceGoals = Array.from(sourcePillarGoal.children || []);
      const destinationGoals = Array.from(destinationPillarGoal.children || []);
      const [movedGoal] = sourceGoals.splice(source.index, 1);
      if (!movedGoal) return;
      destinationGoals.splice(destination.index, 0, movedGoal);

      onMoveGoalAcrossParents?.({
        goal: movedGoal,
        goalType: 'outcome',
        sourceParentId: sourcePillarGoalId,
        destinationParentId: destinationPillarGoalId,
        sourceGoals,
        destinationGoals
      });
    }
  };

  const renderOutcomeDropzone = (pillar) => (
    <Droppable droppableId={`outcome-goals-${pillar.id}`} type="OUTCOME">
      {(provided, snapshot) => (
        <div
          {...provided.droppableProps}
          ref={provided.innerRef}
          className={`mt-4 min-h-[48px] space-y-2 rounded-md transition-colors ${
            snapshot.isDraggingOver ? 'bg-blue-50/70' : ''
          }`}
        >
          {(pillar.children || []).map((outcome, index) => (
            <Draggable
              key={outcome.id}
              draggableId={`outcome-${outcome.id}`}
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
                    isDragging={snapshot.isDragging || recentlyDraggedId === `outcome-${outcome.id}`}
                  />
                </div>
              )}
            </Draggable>
          ))}
          {provided.placeholder}
        </div>
      )}
    </Droppable>
  );

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
                <div className="relative mb-2 lg:mb-8">
                  <GoalCard
                    goal={vision}
                    onClick={onCardClick}
                    taskCount={taskCounts[vision.id] || 0}
                    isInTree={true}
                  />
                  {hasChildren && (
                    <div className="hidden lg:block absolute left-1/2 top-full h-8 border-l-2 border-slate-200" />
                  )}
                </div>

                {/* Pillars - responsive grid */}
                {hasChildren && (
                  <Droppable droppableId={`pillar-goals-${vision.id}`} direction="horizontal" type="PILLAR">
                    {(provided) => (
                      <div
                        {...provided.droppableProps}
                        ref={provided.innerRef}
                        className="relative flex gap-4 lg:gap-6 overflow-x-auto pb-2"
                      >
                        <div className="hidden lg:block absolute left-8 right-8 top-0 border-t-2 border-slate-200" />
                        {vision.children.map((pillar, index) => {
                          return (
                            <Draggable
                              key={pillar.id}
                              draggableId={`pillar-${pillar.id}`}
                              index={index}
                            >
                              {(provided, snapshot) => (
                                <div
                                  ref={provided.innerRef}
                                  {...provided.draggableProps}
                                  style={provided.draggableProps.style}
                                  className="relative min-w-[300px] lg:min-w-[320px] max-w-[340px]"
                                >
                                  <div className="hidden lg:block absolute left-1/2 -top-8 h-8 border-l-2 border-slate-200" />
                                  <div className={`border border-slate-300 rounded p-1.5 lg:p-4 lg:rounded-lg bg-white ${snapshot.isDragging ? 'shadow-lg ring-2 ring-blue-300' : ''}`}>
                                    <GoalCard
                                      goal={pillar}
                                      onClick={onCardClick}
                                      onEdit={onEditClick}
                                      taskCount={taskCounts[pillar.id] || 0}
                                      isInTree={true}
                                      dragHandleProps={provided.dragHandleProps}
                                      isDragging={snapshot.isDragging || recentlyDraggedId === `pillar-${pillar.id}`}
                                    />
                                    {renderOutcomeDropzone(pillar)}
                                    <AddOutcomeButton pillarId={pillar.id} />
                                  </div>
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
        <Droppable droppableId="vision-goals" type="VISION">
          {(provided) => (
            <div
              {...provided.droppableProps}
              ref={provided.innerRef}
              className="space-y-1 lg:space-y-4"
            >
              {tree.map((vision, index) => (
                <Draggable
                  key={vision.id}
                  draggableId={`vision-${vision.id}`}
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
                        isDragging={snapshot.isDragging || recentlyDraggedId === `vision-${vision.id}`}
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
