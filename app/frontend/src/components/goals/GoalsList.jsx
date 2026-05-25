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
  outcomeStatusByGoalId = {},
  expandedGoalId
}) {
  const [recentlyDraggedId, setRecentlyDraggedId] = useState(null);

  const outcomeStatusStyles = {
    not_started: {
      label: 'Not started',
      dot: 'bg-slate-300',
      card: 'border-slate-200 bg-slate-50 hover:bg-slate-100',
      badge: 'text-slate-500'
    },
    done: {
      label: 'Done',
      dot: 'bg-green-500',
      card: 'border-green-200 bg-green-50 hover:bg-green-100',
      badge: 'text-green-700'
    },
    ongoing: {
      label: 'Ongoing',
      dot: 'bg-blue-500',
      card: 'border-blue-200 bg-blue-50 hover:bg-blue-100',
      badge: 'text-blue-700'
    },
    at_risk: {
      label: 'At risk',
      dot: 'bg-orange-500',
      card: 'border-orange-200 bg-orange-50 hover:bg-orange-100',
      badge: 'text-orange-700'
    },
    blocked: {
      label: 'Blocking issue',
      dot: 'bg-red-500',
      card: 'border-red-200 bg-red-50 hover:bg-red-100',
      badge: 'text-red-700'
    }
  };

  const getOutcomeStatusStyle = (goalId) => {
    const status = outcomeStatusByGoalId[goalId] || 'not_started';
    return outcomeStatusStyles[status] || outcomeStatusStyles.not_started;
  };
  
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

  const getGoalTitle = (goal) => goal.title || goal.goal_text;

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
          {(pillar.children || []).map((outcome, index) => {
            const statusStyle = getOutcomeStatusStyle(outcome.id);

            return (
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
                    <div
                      {...provided.dragHandleProps}
                      onClick={(event) => {
                        event.stopPropagation();
                        onCardClick(outcome);
                      }}
                      className={`rounded border ${statusStyle.card} p-3 cursor-grab active:cursor-grabbing ${
                        snapshot.isDragging || recentlyDraggedId === `outcome-${outcome.id}`
                          ? 'shadow-lg ring-2 ring-blue-200'
                          : ''
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${statusStyle.dot}`} />
                        <div className="min-w-0">
                          <div className="font-medium text-slate-800 break-words">
                            {getGoalTitle(outcome)}
                          </div>
                          <div className={`mt-1 text-xs ${statusStyle.badge}`}>{statusStyle.label}</div>
                        </div>
                      </div>
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
              <div className="inline-flex min-w-full flex-col">
                {/* Vision in tree */}
                <div
                  className="mb-4 rounded-lg border border-slate-200 bg-white p-4"
                  style={{
                    width: hasChildren
                      ? `${vision.children.length * 320 + Math.max(vision.children.length - 1, 0) * 24}px`
                      : undefined
                  }}
                >
                  <div
                    onClick={() => onCardClick(vision)}
                    className="cursor-pointer"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="text-xl font-semibold text-slate-900 break-words">
                          {getGoalTitle(vision)}
                        </h2>
                        <div className="mt-2 text-xs text-slate-500">Vision</div>
                      </div>
                    </div>
                  </div>
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
                                  <div
                                    onClick={() => onCardClick(pillar)}
                                    className={`border-2 border-slate-200 rounded-lg bg-white p-4 cursor-pointer ${
                                      snapshot.isDragging || recentlyDraggedId === `pillar-${pillar.id}`
                                        ? 'shadow-lg ring-2 ring-blue-300'
                                        : ''
                                    }`}
                                  >
                                    <div className="min-w-0" {...provided.dragHandleProps}>
                                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                        Pillar {index + 1}
                                      </div>
                                      <div className="mt-1 flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                          <h3 className="text-lg font-semibold text-slate-900 break-words">
                                            {getGoalTitle(pillar)}
                                          </h3>
                                          <div className="mt-2 text-xs text-slate-500">Pillar</div>
                                        </div>
                                      </div>
                                    </div>
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
                        taskCount={0}
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
