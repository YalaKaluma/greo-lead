import { DragDropContext, Droppable } from 'react-beautiful-dnd';
import TaskItem from './TaskItem';
import { TaskColumnHeader } from './PageControls';

export default function TaskListPanel({
  activeTab,
  sortedTasks,
  hasActiveFilters,
  emptyText,
  emptyFilteredText,
  emptyNewText,
  selectionMode,
  columnSort,
  onSort,
  onDragEnd,
  completingTasks,
  selectedTasks,
  onToggleTask,
  onStartEdit,
  onLongPress,
  onSelectToggle,
  onFollowUp,
  onDoLater = () => {},
  doLaterLabel = 'Do later',
  goals,
  priorityMode,
  getVisibleTaskScore,
  onMtnFeedback,
  timezone,
}) {
  if (activeTab !== 'tasks') return null;

  if (sortedTasks.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-600 text-lg">{emptyText}</p>
        <p className="text-slate-500 text-sm mt-2">
          {hasActiveFilters ? emptyFilteredText : emptyNewText}
        </p>
      </div>
    );
  }

  return (
    <>
      {!selectionMode && (
        <TaskColumnHeader
          columnSort={columnSort}
          onSort={onSort}
        />
      )}
      <DragDropContext onDragEnd={onDragEnd}>
        <Droppable droppableId="tasks">
          {(provided) => (
            <div
              {...provided.droppableProps}
              ref={provided.innerRef}
              className="space-y-1"
            >
              {sortedTasks.map((task, index) => {
                const scoreData = getVisibleTaskScore(task);

                return (
                  <TaskItem
                    key={task.id}
                    task={task}
                    index={index}
                    isCompleting={completingTasks.includes(task.id)}
                    isSelected={selectedTasks.includes(task.id)}
                    selectionMode={selectionMode}
                    onToggle={() => onToggleTask(task.id)}
                    onStartEdit={() => onStartEdit(task)}
                    onLongPress={() => onLongPress(task.id)}
                    onSelectToggle={() => onSelectToggle(task.id)}
                    onFollowUp={() => onFollowUp(task)}
                    onDoLater={() => onDoLater(task)}
                    doLaterLabel={doLaterLabel}
                    goals={goals}
                    priorityMode={priorityMode || Boolean(scoreData)}
                    priorityScore={scoreData}
                    onMtnFeedback={(rating, feedback, tag, recommendationId, scoreId, adjustedScore) => (
                      onMtnFeedback(task.id, rating, feedback, tag, recommendationId, scoreId, adjustedScore)
                    )}
                    timezone={timezone}
                  />
                );
              })}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>
    </>
  );
}
