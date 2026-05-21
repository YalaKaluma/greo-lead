import { useState } from 'react';
import { Draggable } from 'react-beautiful-dnd';
import { getPriorityIcon, formatDueDate, getDueDateColor } from '../../utils/taskHelpers';

/**
 * TaskItem Component
 *
 * Individual task in the list with:
 * - Drag and drop support
 * - Long-press for multi-select (750ms)
 * - Swipe gestures
 * - Click to edit
 * - Completion toggle
 * - Visual feedback for all interactions
 */
export default function TaskItem({
  task,
  index,
  isCompleting,
  isSelected,
  selectionMode,
  onToggle,
  onStartEdit,
  onLongPress,
  onSelectToggle,
  goals,
  priorityMode = false,
  priorityScore = null
}) {
  const [swipeDistance, setSwipeDistance] = useState(0);
  const [touchStartX, setTouchStartX] = useState(0);
  const [longPressTimer, setLongPressTimer] = useState(null);

  const onTouchStart = (e) => {
    setTouchStartX(e.touches[0].clientX);

    const timer = setTimeout(() => {
      if (!selectionMode) {
        onLongPress();
        if (navigator.vibrate) {
          navigator.vibrate(50);
        }
      }
    }, 750);
    setLongPressTimer(timer);
  };

  const onTouchMove = (e) => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      setLongPressTimer(null);
    }

    const currentX = e.touches[0].clientX;
    const distance = Math.max(0, touchStartX - currentX);
    setSwipeDistance(Math.min(distance, 100));
  };

  const onTouchEnd = () => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      setLongPressTimer(null);
    }
    setSwipeDistance(0);
  };

  return (
    <Draggable draggableId={String(task.id)} index={index} isDragDisabled={selectionMode || priorityMode}>
      {(provided, snapshot) => (
        <TaskCard
          task={task}
          index={index}
          provided={provided}
          snapshot={snapshot}
          isCompleting={isCompleting}
          isSelected={isSelected}
          selectionMode={selectionMode}
          swipeDistance={swipeDistance}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onToggle={onToggle}
          onStartEdit={onStartEdit}
          onLongPress={onLongPress}
          onSelectToggle={onSelectToggle}
          goals={goals}
          priorityMode={priorityMode}
          priorityScore={priorityScore}
        />
      )}
    </Draggable>
  );
}

function TaskCard({
  task,
  index,
  provided,
  snapshot,
  isCompleting,
  isSelected,
  selectionMode,
  swipeDistance,
  onTouchStart,
  onTouchMove,
  onTouchEnd,
  onToggle,
  onStartEdit,
  onLongPress,
  onSelectToggle,
  goals,
  priorityMode,
  priorityScore
}) {
  const goalLabel =
    goals.find(g => g.id === task.goal_id)?.title ||
    goals.find(g => g.id === task.goal_id)?.goal_text ||
    'Goal';

  const getMtnLabel = (score) => {
    if (score >= 0.85) return 'Transformational';
    if (score >= 0.7) return 'Strategic';
    if (score >= 0.5) return 'Important';
    if (score >= 0.3) return 'Maintenance';
    return 'Low Leverage';
  };

  const getMtnStyle = (score) => {
    if (score >= 0.85) return 'bg-blue-100 text-blue-800 border-blue-200';
    if (score >= 0.7) return 'bg-emerald-100 text-emerald-800 border-emerald-200';
    if (score >= 0.5) return 'bg-amber-100 text-amber-800 border-amber-200';
    if (score >= 0.3) return 'bg-slate-100 text-slate-700 border-slate-200';
    return 'bg-gray-100 text-gray-600 border-gray-200';
  };

  const handleClick = (e) => {
    if (priorityMode) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      e.stopPropagation();
      if (!selectionMode) {
        onLongPress();
      } else {
        onSelectToggle();
      }
      return;
    }

    if (selectionMode) {
      e.preventDefault();
      e.stopPropagation();
      onSelectToggle();
      return;
    }

    onStartEdit();
  };

  return (
    <div
      ref={provided.innerRef}
      {...provided.draggableProps}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      style={{
        ...provided.draggableProps.style,
        transform: `${provided.draggableProps.style?.transform || ''} translateX(-${swipeDistance}px)`,
      }}
      className={`
        bg-white border-2 rounded px-3 py-2
        hover:border-gray-300 transition-all
        ${snapshot.isDragging ? 'opacity-50 scale-98 shadow-lg' : ''}
        ${isCompleting ? 'opacity-60' : ''}
        ${index >= 10 && !priorityMode ? 'opacity-40' : ''}
        ${isSelected ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}
        ${priorityMode ? 'cursor-default' : 'cursor-pointer'}
        ${priorityMode && priorityScore?.score >= 0.75 ? 'border-blue-300 bg-blue-50' : ''}
      `}
      onClick={handleClick}
    >
      <div className={`flex items-start gap-2 ${isCompleting ? 'line-through' : ''}`}>
        {isSelected && (
          <div className="flex-shrink-0 mt-0.5">
            <div className="w-5 h-5 bg-blue-600 rounded-full flex items-center justify-center">
              <span className="text-white text-xs">x</span>
            </div>
          </div>
        )}

        {!selectionMode && !priorityMode && (
          <div
            {...provided.dragHandleProps}
            className="text-slate-300 cursor-grab active:cursor-grabbing mt-0.5"
            onClick={(e) => e.stopPropagation()}
          >
            ::
          </div>
        )}

        {!selectionMode && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
            className="flex-shrink-0 text-2xl hover:scale-110 transition-transform"
            title={`${task.priority} priority - Click to complete`}
          >
            {getPriorityIcon(task.priority)}
          </button>
        )}

        <div className="flex-1 min-w-0">
          <div
            className="font-medium text-slate-800 text-base break-words leading-tight cursor-pointer hover:text-blue-600 transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              if (!priorityMode) onStartEdit();
            }}
            title={priorityMode ? 'Return to Manual View to edit' : 'Click to edit/reschedule'}
          >
            {task.title}
          </div>

          <div className="flex items-center justify-between mt-1">
            <div>
              {task.due_date && (
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${getDueDateColor(task.due_date)}`}>
                  {formatDueDate(task.due_date)}
                </span>
              )}
            </div>

            {task.goal_id && (
              <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-xs font-medium">
                Goal: {goalLabel}
              </span>
            )}
          </div>

          {task.notes && (
            <p className="text-sm text-slate-600 leading-snug mt-1">
              {task.notes}
            </p>
          )}

          {task.delegated_to && (
            <div className="mt-1">
              <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs">
                Delegated: {task.delegated_to}
              </span>
            </div>
          )}

          {priorityMode && priorityScore && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className={`text-xs px-2 py-0.5 rounded border font-medium ${getMtnStyle(priorityScore.score)}`}>
                MTN: {getMtnLabel(priorityScore.score)}
              </span>
              {priorityScore.reason && (
                <span className="text-xs text-slate-600">
                  {priorityScore.reason}
                </span>
              )}
            </div>
          )}
        </div>

        {priorityMode && priorityScore?.score >= 0.85 && (
          <div className="flex-shrink-0 ml-2">
            <div className="h-2 w-2 rounded-full bg-blue-500 mt-2" title="Highest leverage" />
          </div>
        )}
      </div>
    </div>
  );
}
