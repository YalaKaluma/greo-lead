// frontend/src/components/TodoList/TaskItem.jsx
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
  // Priority mode props
  priorityMode = false,
  priorityDecision = null,
  priorityScore = null,
  onPriorityAccept = null,
  onPriorityReject = null
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
          priorityDecision={priorityDecision}
          priorityScore={priorityScore}
          onPriorityAccept={onPriorityAccept}
          onPriorityReject={onPriorityReject}
        />
      )}
    </Draggable>
  );
}

// Task Card Component
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
  priorityDecision,
  priorityScore,
  onPriorityAccept,
  onPriorityReject
}) {
  const goalLabel =
    goals.find(g => g.id === task.goal_id)?.title ||
    goals.find(g => g.id === task.goal_id)?.goal_text ||
    'Goal';

  const handleClick = (e) => {
    // Priority mode: clicking does nothing (use buttons instead)
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
        ${index >= 10 ? 'opacity-40' : ''}
        ${isSelected ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}
        ${priorityMode && !priorityDecision ? 'cursor-default' : 'cursor-pointer'}
        ${priorityDecision === 'accept' ? 'border-green-300 bg-green-50' : ''}
        ${priorityDecision === 'reject' ? 'border-red-300 bg-red-50' : ''}
      `}
      onClick={handleClick}
    >
      <div className={`flex items-start gap-2 ${isCompleting ? 'line-through' : ''}`}>
        {isSelected && (
          <div className="flex-shrink-0 mt-0.5">
            <div className="w-5 h-5 bg-blue-600 rounded-full flex items-center justify-center">
              <span className="text-white text-xs">✓</span>
            </div>
          </div>
        )}

        {!selectionMode && !priorityMode && (
          <div
            {...provided.dragHandleProps}
            className="text-slate-300 cursor-grab active:cursor-grabbing mt-0.5"
            onClick={(e) => e.stopPropagation()}
          >
            ⋮⋮
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
              onStartEdit();
            }}
            title="Click to edit/reschedule"
          >
            {task.title}
          </div>

          <div className="flex items-center justify-between mt-1">
            <div>
              {task.due_date && (
                <span
                  className={`px-2 py-0.5 rounded text-xs font-medium ${getDueDateColor(
                    task.due_date
                  )}`}
                >
                  {formatDueDate(task.due_date)}
                </span>
              )}
            </div>

            {task.goal_id && (
              <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-xs font-medium">
                🎯 {goalLabel}
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
                👤 {task.delegated_to}
              </span>
            </div>
          )}

          {/* Priority Score Display */}
          {priorityMode && priorityScore && (
            <div className="mt-2 p-2 bg-gray-50 rounded border border-gray-200">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-medium text-blue-600">
                  Score: {(priorityScore.score * 100).toFixed(0)}%
                </span>
                <span className={`text-xs px-2 py-0.5 rounded ${
                  priorityScore.confidence === 'high' ? 'bg-green-100 text-green-800' :
                  priorityScore.confidence === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                  'bg-gray-100 text-gray-800'
                }`}>
                  {priorityScore.confidence} confidence
                </span>
              </div>
              <p className="text-xs text-gray-700">
                {priorityScore.reason}
              </p>
            </div>
          )}

          {/* Decision Indicator */}
          {priorityDecision && (
            <div className={`mt-2 text-xs font-semibold ${
              priorityDecision === 'accept' ? 'text-green-700' : 'text-red-700'
            }`}>
              {priorityDecision === 'accept' ? '✓ Accepted for Top 10' : '✗ Rejected'}
            </div>
          )}
        </div>

        {/* Priority Mode Buttons - Right side */}
        {priorityMode && !priorityDecision && (
          <div className="flex-shrink-0 flex gap-1.5 ml-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onPriorityAccept?.();
              }}
              className="px-3 py-1.5 text-xs bg-green-600 hover:bg-green-700 text-white rounded font-medium transition-colors"
              title="Accept for Top 10"
            >
              ✓ Accept
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onPriorityReject?.();
              }}
              className="px-3 py-1.5 text-xs bg-red-600 hover:bg-red-700 text-white rounded font-medium transition-colors"
              title="Reject"
            >
              ✗ Reject
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
