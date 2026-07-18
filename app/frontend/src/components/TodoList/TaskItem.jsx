import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Draggable } from 'react-beautiful-dnd';
import { getPriorityIcon, formatDueDate, getDueDateColor, getMtnLabel, getMtnStyle, MTN_TAG_OPTIONS } from '../../utils/taskHelpers';

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
  onFollowUp,
  onDoLater = null,
  doLaterLabel = 'Do later',
  goals,
  priorityMode = false,
  priorityScore = null,
  onMtnFeedback = null,
  timezone
}) {
  const [swipeDistance, setSwipeDistance] = useState(0);
  const [touchStartX, setTouchStartX] = useState(0);
  const [longPressTimer, setLongPressTimer] = useState(null);
  const cardRef = useRef(null);
  const swipeDistanceRef = useRef(0);
  const suppressClickRef = useRef(false);
  const longPressFiredRef = useRef(false);

  const onTouchStart = (e) => {
    setTouchStartX(e.touches[0].clientX);
    longPressFiredRef.current = false;

    const timer = setTimeout(() => {
      if (!selectionMode) {
        longPressFiredRef.current = true;
        suppressClickRef.current = true;
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
    const nextDistance = Math.min(distance, 120);
    swipeDistanceRef.current = nextDistance;
    if (nextDistance > 10) {
      suppressClickRef.current = true;
    }
    setSwipeDistance(nextDistance);
  };

  const onTouchEnd = () => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      setLongPressTimer(null);
    }
    const width = cardRef.current?.offsetWidth || 0;
    const threshold = Math.min(120, Math.max(80, width * 0.25));
    const shouldOpenFollowUp = !selectionMode && !longPressFiredRef.current && swipeDistanceRef.current >= threshold;
    swipeDistanceRef.current = 0;
    setSwipeDistance(0);

    if (shouldOpenFollowUp && onFollowUp) {
      onFollowUp();
    }

    window.setTimeout(() => {
      suppressClickRef.current = false;
      longPressFiredRef.current = false;
    }, 250);
  };

  return (
    <Draggable draggableId={String(task.id)} index={index} isDragDisabled={selectionMode}>
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
          onFollowUp={onFollowUp}
          onDoLater={onDoLater}
          doLaterLabel={doLaterLabel}
          goals={goals}
          priorityMode={priorityMode}
          priorityScore={priorityScore}
          onMtnFeedback={onMtnFeedback}
          timezone={timezone}
          cardRef={cardRef}
          suppressClickRef={suppressClickRef}
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
  onFollowUp,
  onDoLater,
  doLaterLabel,
  goals,
  priorityMode,
  priorityScore,
  onMtnFeedback,
  timezone,
  cardRef,
  suppressClickRef
}) {
  const [showMtnFeedback, setShowMtnFeedback] = useState(false);
  const [mtnRating, setMtnRating] = useState(0);
  const [mtnFeedback, setMtnFeedback] = useState('');
  const [mtnSelectedTag, setMtnSelectedTag] = useState('');
  const [mtnSaving, setMtnSaving] = useState(false);
  const [mtnSaved, setMtnSaved] = useState(false);

  const goalLabel =
    goals.find(g => g.id === task.goal_id)?.title ||
    goals.find(g => g.id === task.goal_id)?.goal_text ||
    'Goal';

  const handleClick = (e) => {
    if (suppressClickRef?.current) {
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

  const handleSelectionModeClick = (e) => {
    if (!selectionMode) {
      return false;
    }

    e.preventDefault();
    e.stopPropagation();
    onSelectToggle();
    return true;
  };

  const handleSelectionShortcut = (e) => {
    if (!e.ctrlKey && !e.metaKey) {
      return false;
    }

    e.preventDefault();
    e.stopPropagation();
    if (!selectionMode) {
      onLongPress();
    } else {
      onSelectToggle();
    }
    return true;
  };

  const mtnLabel = priorityScore ? getMtnLabel(priorityScore.score) : '';
  const activeMtnTag = mtnSelectedTag || mtnLabel;
  const isBelowTopTen = index >= 10;
  const mutedBadgeClass = 'bg-slate-100 text-slate-500 border-slate-200';

  const openMtnFeedback = () => {
    setMtnSelectedTag(previousTag => previousTag || mtnLabel);
    setShowMtnFeedback(true);
  };

  const submitMtnFeedback = async () => {
    if (!mtnRating || !onMtnFeedback) return;

    setMtnSaving(true);
    const result = await onMtnFeedback(
      mtnRating,
      mtnFeedback.trim() || null,
      activeMtnTag,
      priorityScore.recommendation_id
    );
    setMtnSaving(false);

    if (result?.success) {
      setMtnSaved(true);
      setShowMtnFeedback(false);
    }
  };

  return (
    <div
      id={`task-${task.id}`}
      ref={provided.innerRef}
      {...provided.draggableProps}
      style={{
        ...provided.draggableProps.style,
      }}
      className="relative overflow-hidden rounded"
    >
      {!selectionMode && (
        <div className="absolute inset-y-0 right-0 flex w-32 items-center justify-end bg-slate-800 pr-4 text-white sm:hidden">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold">
            <ClockReturnIcon />
            Follow Up
          </span>
        </div>
      )}

      <div
        ref={cardRef}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{
          transform: `translateX(-${swipeDistance}px)`,
        }}
        className={`
          relative border-2 rounded px-3 py-2 sm:pr-10
          hover:border-gray-300 transition-all
          ${snapshot.isDragging ? 'opacity-50 scale-98 shadow-lg' : ''}
          ${isCompleting ? 'opacity-60' : ''}
          ${isBelowTopTen ? 'bg-slate-50' : 'bg-white'}
          ${isSelected ? 'border-blue-500 bg-blue-50' : isBelowTopTen ? 'border-slate-200' : 'border-gray-200'}
          cursor-pointer
        `}
        onClick={handleClick}
      >
      {!selectionMode && (
        <div className="absolute right-2 top-2 hidden flex-col gap-0.5 sm:flex">
          <button
            type="button"
            onClick={(e) => {
              if (handleSelectionShortcut(e)) return;
              e.stopPropagation();
              onFollowUp?.();
            }}
            className="inline-flex h-6 w-7 items-center justify-center rounded text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            title="Create follow-up"
            aria-label="Create follow-up"
          >
            <ClockReturnIcon />
          </button>
          <button
            type="button"
            onClick={(e) => {
              if (handleSelectionShortcut(e)) return;
              e.stopPropagation();
              onDoLater?.();
            }}
            className="inline-flex h-6 w-7 items-center justify-center rounded text-slate-400 transition-colors hover:bg-blue-50 hover:text-blue-700"
            title={doLaterLabel}
            aria-label={doLaterLabel}
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5 12h14" />
              <path d="m12 5 7 7-7 7" />
            </svg>
          </button>
        </div>
      )}

      <div className={`flex items-start gap-2 ${isCompleting ? 'line-through' : ''}`}>
        {isSelected && (
          <div className="flex-shrink-0 mt-0.5">
            <div className="w-5 h-5 bg-blue-600 rounded-full flex items-center justify-center">
              <span className="text-white text-xs">x</span>
            </div>
          </div>
        )}

        {!selectionMode && (
          <div
            {...provided.dragHandleProps}
            className="text-slate-300 cursor-grab active:cursor-grabbing mt-0.5"
            onClick={(e) => {
              if (handleSelectionShortcut(e)) return;
              e.stopPropagation();
            }}
          >
            ::
          </div>
        )}

        {!selectionMode && (
          <button
            onClick={(e) => {
              if (handleSelectionShortcut(e)) return;
              e.stopPropagation();
              onToggle();
            }}
            className={`flex-shrink-0 text-2xl transition-transform hover:scale-110 ${isBelowTopTen ? 'grayscale opacity-45' : ''}`}
            title={`${task.priority} priority - Click to complete`}
          >
            {getPriorityIcon(task.priority)}
          </button>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-1.5">
            {task.is_recurring && (
              <span
                className="mt-0.5 inline-flex h-4 w-4 flex-shrink-0 items-center justify-center text-blue-600"
                title="This task will automatically recreate itself after completion."
                aria-label="Recurring task"
              >
                <RepeatIcon />
              </span>
            )}
            <div
              className={`text-base break-words leading-tight cursor-pointer transition-colors ${
                isBelowTopTen
                  ? 'font-normal italic text-slate-500 hover:text-slate-600'
                  : 'font-medium text-slate-800 hover:text-blue-600'
              }`}
              onClick={(e) => {
                if (handleSelectionShortcut(e)) return;
                if (handleSelectionModeClick(e)) return;
                e.stopPropagation();
                onStartEdit();
              }}
              title="Click to edit/reschedule"
            >
              {task.title}
            </div>
          </div>

          <div className="mt-1 flex items-start gap-2">
            <div className="flex-shrink-0">
              {task.due_date && (
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${isBelowTopTen ? 'bg-slate-100 text-slate-500' : getDueDateColor(task.due_date, timezone)}`}>
                  {formatDueDate(task.due_date, timezone)}
                </span>
              )}
            </div>

            <div className="min-w-0 flex-1 flex flex-col items-end gap-1 sm:flex-row sm:justify-end">
              {priorityMode && priorityScore && (
                <button
                  onClick={(e) => {
                    if (handleSelectionModeClick(e)) return;
                    e.stopPropagation();
                    openMtnFeedback();
                  }}
                  className={`max-w-full truncate whitespace-nowrap text-xs px-2 py-0.5 rounded border font-medium sm:hidden ${isBelowTopTen ? mutedBadgeClass : getMtnStyle(activeMtnTag)}`}
                  title="Review prioritization reasoning"
                >
                  {activeMtnTag}
                </button>
              )}

              {task.goal_id && (
                <span
                  className={`max-w-full truncate whitespace-nowrap px-2 py-0.5 rounded text-xs font-medium ${isBelowTopTen ? 'bg-slate-100 text-slate-500' : 'bg-slate-100 text-slate-700'}`}
                  title={`Goal: ${goalLabel}`}
                >
                  Goal: {goalLabel}
                </span>
              )}
            </div>
          </div>

          {task.delegated_to && (
            <div className="mt-1">
              <span className={`px-2 py-0.5 rounded text-xs ${isBelowTopTen ? 'bg-slate-100 text-slate-500' : 'bg-blue-100 text-blue-700'}`}>
                Delegated: {task.delegated_to}
              </span>
            </div>
          )}

        </div>

        {priorityMode && priorityScore && (
          <div className="hidden flex-shrink-0 ml-3 sm:flex items-center gap-2">
            <button
              onClick={(e) => {
                if (handleSelectionModeClick(e)) return;
                e.stopPropagation();
                openMtnFeedback();
              }}
              className={`whitespace-nowrap text-xs px-2 py-0.5 rounded border font-medium ${isBelowTopTen ? mutedBadgeClass : getMtnStyle(activeMtnTag)}`}
              title="Review prioritization reasoning"
            >
              {activeMtnTag}
            </button>
            {mtnSaved && (
              <span className="text-xs text-emerald-700">Saved</span>
            )}
          </div>
        )}
      </div>

      {priorityMode && priorityScore && showMtnFeedback && (
        <MtnFeedbackModal
          tag={mtnLabel}
          selectedTag={activeMtnTag}
          setSelectedTag={setMtnSelectedTag}
          score={priorityScore}
          rating={mtnRating}
          setRating={setMtnRating}
          feedback={mtnFeedback}
          setFeedback={setMtnFeedback}
          saving={mtnSaving}
          onSubmit={submitMtnFeedback}
          onClose={() => setShowMtnFeedback(false)}
        />
      )}
      </div>
    </div>
  );
}

function RepeatIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m17 2 4 4-4 4" />
      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
      <path d="m7 22-4-4 4-4" />
      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </svg>
  );
}

function ClockReturnIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
      <path d="M8 18H4v-4" />
      <path d="M4 18a8 8 0 0 0 5 2.7" />
    </svg>
  );
}

function MtnFeedbackModal({
  tag,
  selectedTag,
  setSelectedTag,
  score,
  rating,
  setRating,
  feedback,
  setFeedback,
  saving,
  onSubmit,
  onClose
}) {
  return createPortal(
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4"
      style={{ zIndex: 9999 }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg p-6 max-w-3xl w-full shadow-2xl max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <p className="text-xs uppercase text-slate-500 font-semibold">Tag</p>
            <h3 className="text-xl font-semibold text-slate-800">{selectedTag || tag}</h3>
          </div>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-800 text-xl leading-none"
            aria-label="Close"
          >
            x
          </button>
        </div>

        <div className="space-y-3 mb-5">
          <div>
            <p className="text-sm font-medium text-slate-700 mb-2">Change tag</p>
            <div className="flex flex-nowrap gap-2">
              {MTN_TAG_OPTIONS.map(option => {
                const isSelected = (selectedTag || tag) === option;
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setSelectedTag(option)}
                    aria-pressed={isSelected}
                    className={`min-w-0 flex-1 whitespace-nowrap rounded border px-2 py-1.5 text-center text-xs font-semibold transition-all ${getMtnStyle(option)} ${
                      isSelected ? 'ring-2 ring-slate-900 ring-offset-1' : 'hover:shadow-sm'
                    }`}
                  >
                    {option}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <p className="text-sm font-medium text-slate-700 mb-1">Why Alfred tagged it this way</p>
            <p className="text-sm text-slate-600">
              {score.reason || 'No explanation available for this MTN score.'}
            </p>
          </div>

          {score.risk_if_ignored && (
            <div>
              <p className="text-sm font-medium text-slate-700 mb-1">Risk if ignored</p>
              <p className="text-sm text-slate-600">{score.risk_if_ignored}</p>
            </div>
          )}
        </div>

        <div className="mb-4">
          <p className="text-sm font-medium text-slate-700 mb-2">How useful is this tag?</p>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map(value => (
              <button
                key={value}
                onClick={() => setRating(value)}
                className={`text-2xl leading-none ${value <= rating ? 'text-amber-500' : 'text-slate-300'}`}
                aria-label={`${value} star${value > 1 ? 's' : ''}`}
              >
                {value <= rating ? '★' : '☆'}
              </button>
            ))}
          </div>
        </div>

        <textarea
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          placeholder="Optional: what should Alfred learn from your reaction?"
          className="w-full p-3 border border-gray-300 rounded-lg mb-4 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          rows={4}
        />

        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={onSubmit}
            disabled={!rating || saving}
            className="px-5 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving...' : 'Save Feedback'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
