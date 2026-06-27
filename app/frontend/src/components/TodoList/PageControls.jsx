import {
  addDays,
  dateFromKey,
  formatCalendarRangeLabel,
  formatDateKey,
  formatMonthShort,
  formatShortDate,
  getRollingCalendarDays,
} from '../../utils/todoDateLogic.js';

function IconSvg({ children, className = '' }) {
  return (
    <svg className={`h-4 w-4 ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

function ResetIcon() {
  return (
    <IconSvg>
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v6h6" />
    </IconSvg>
  );
}

function CalendarIcon() {
  return (
    <IconSvg>
      <path d="M8 2v4" />
      <path d="M16 2v4" />
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M3 10h18" />
    </IconSvg>
  );
}

function SparkIcon() {
  return (
    <IconSvg>
      <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />
    </IconSvg>
  );
}

function LightbulbIcon() {
  return (
    <IconSvg>
      <path d="M9 18h6" />
      <path d="M10 22h4" />
      <path d="M12 2a7 7 0 0 0-4 12.74V16h8v-1.26A7 7 0 0 0 12 2Z" />
    </IconSvg>
  );
}

function CalendarArrowIcon() {
  return (
    <IconSvg>
      <path d="M8 2v4" />
      <path d="M16 2v4" />
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M3 10h18" />
      <path d="M8 15h7" />
      <path d="m12 12 3 3-3 3" />
    </IconSvg>
  );
}

function PlusIcon() {
  return (
    <IconSvg>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </IconSvg>
  );
}

function CloseIcon() {
  return (
    <IconSvg>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </IconSvg>
  );
}

function SpinnerIcon() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4Z" />
    </svg>
  );
}

export function TodoPageHeader({
  title,
  selectionMode,
  selectedCount,
  activeTab,
  sortOrderCount,
  taskCount,
  sortedTaskCount,
  priorityLoading,
  opportunityLoading,
  mtnNeedle,
  onResetSort,
  onSetOverdueToToday,
  onRunPrioritization,
  onOpenOpportunityModal,
  onOpenDeferModal,
  onAddTask,
}) {
  const isTaskPlanningTab = activeTab === 'tasks' || activeTab === 'calendar';

  return (
    <div className="mb-6 grid grid-cols-1 items-start gap-4 lg:grid-cols-[1fr_auto_1fr]">
      <div className={`order-1 min-w-0 lg:order-none ${selectionMode ? '' : 'hidden sm:block'}`}>
        <h1 className="text-3xl font-bold text-slate-800 hidden lg:block">
          {title}
        </h1>
        <p className={`text-slate-600 mt-1 ${selectionMode ? '' : 'hidden sm:block'}`}>
          {selectionMode ? (
            <span className="text-blue-600 font-medium">
              {selectedCount} task(s) selected
            </span>
          ) : (
            'Move the needle'
          )}
        </p>
      </div>
      {!selectionMode && (
        <div className="order-3 flex justify-center lg:order-none lg:pt-9">
          {mtnNeedle}
        </div>
      )}
      <div className="order-2 flex justify-center lg:order-none lg:justify-end">
        <div className="flex flex-wrap justify-center gap-2 lg:justify-end">
          {sortOrderCount > 0 && !selectionMode && activeTab === 'tasks' && (
            <button
              onClick={onResetSort}
              className="h-10 w-10 inline-flex items-center justify-center bg-slate-300 hover:bg-slate-400 text-slate-800 rounded-lg transition-colors"
              title="Reset manual sort"
              aria-label="Reset manual sort"
            >
              <ResetIcon />
            </button>
          )}
          {!selectionMode && isTaskPlanningTab && (
            <>
              <button
                onClick={onSetOverdueToToday}
                className="h-10 w-10 inline-flex items-center justify-center bg-orange-500 hover:bg-orange-600 text-white rounded-lg transition-colors"
                title="Move overdue tasks to today"
                aria-label="Move overdue tasks to today"
              >
                <CalendarIcon />
              </button>
              <button
                onClick={onRunPrioritization}
                disabled={priorityLoading || taskCount === 0}
                className="h-10 w-10 inline-flex items-center justify-center bg-slate-800 hover:bg-slate-900 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="Prioritize tasks"
                aria-label="Prioritize tasks"
              >
                {priorityLoading ? (
                  <SpinnerIcon />
                ) : (
                  <SparkIcon />
                )}
              </button>
              <button
                onClick={onOpenOpportunityModal}
                disabled={opportunityLoading}
                className="h-10 w-10 inline-flex items-center justify-center bg-amber-400 hover:bg-amber-500 text-slate-900 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="Suggest move-the-needle actions"
                aria-label="Suggest move-the-needle actions"
              >
                <LightbulbIcon />
              </button>
              <button
                onClick={onOpenDeferModal}
                disabled={activeTab !== 'tasks' || sortedTaskCount <= 10}
                className="h-10 w-10 inline-flex items-center justify-center bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="Move non-Top-10 tasks to tomorrow"
                aria-label="Move non-Top-10 tasks to tomorrow"
              >
                <CalendarArrowIcon />
              </button>
              <button
                onClick={onAddTask}
                className="h-10 w-10 inline-flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                title="Add task"
                aria-label="Add task"
              >
                <PlusIcon />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function TodoTabs({ activeTab, showTaskTrends, onChangeTab }) {
  return (
    <div className="mb-6 border-b border-slate-200">
      <div className="flex flex-wrap gap-6">
        <button
          type="button"
          onClick={() => onChangeTab('tasks')}
          className={`relative px-2 pb-3 font-medium transition-colors ${
            activeTab === 'tasks'
              ? 'text-blue-600'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          List
          {activeTab === 'tasks' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />
          )}
        </button>
        <button
          type="button"
          onClick={() => onChangeTab('calendar')}
          className={`relative px-2 pb-3 font-medium transition-colors ${
            activeTab === 'calendar'
              ? 'text-blue-600'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          Calendar
          {activeTab === 'calendar' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />
          )}
        </button>
        {showTaskTrends && (
          <button
            type="button"
            onClick={() => onChangeTab('trends')}
            className={`relative px-2 pb-3 font-medium transition-colors ${
              activeTab === 'trends'
                ? 'text-blue-600'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Trends
            {activeTab === 'trends' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />
            )}
          </button>
        )}
      </div>
    </div>
  );
}

export function FloatingSelectionBar({ selectedCount, onCancel, onEditSelected }) {
  if (selectedCount <= 0) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t-2 border-blue-500 shadow-2xl z-50">
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <span className="text-slate-700 font-medium">
            {selectedCount} selected
          </span>
          <button
            onClick={onCancel}
            className="text-slate-600 hover:text-slate-800 text-sm"
          >
            Cancel
          </button>
        </div>
        <button
          onClick={onEditSelected}
          className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium transition-colors"
        >
          Edit Selected
        </button>
      </div>
    </div>
  );
}

export function TaskColumnHeader({ columnSort, onSort }) {
  return (
    <>
      <MobileTaskSortControl columnSort={columnSort} onSort={onSort} />
      <div className="hidden sm:grid grid-cols-[3.75rem_minmax(0,1fr)_10rem_1.75rem] items-center px-3 pb-1 pt-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        <SortHeaderButton
          label="Urgency"
          sortKey="urgency"
          columnSort={columnSort}
          onSort={onSort}
          className="col-start-1 justify-self-start"
        />
        <SortHeaderButton
          label="Importance"
          sortKey="importance"
          columnSort={columnSort}
          onSort={onSort}
          className="col-start-3 justify-self-end"
        />
      </div>
    </>
  );
}

export function MobileTaskSortControl({ columnSort, onSort }) {
  return (
    <div className="mb-2 flex items-center justify-between px-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400 sm:hidden">
      <SortHeaderButton
        label="Urgency"
        sortKey="urgency"
        columnSort={columnSort}
        onSort={onSort}
        className="justify-start"
      />
      <SortHeaderButton
        label="Importance"
        sortKey="importance"
        columnSort={columnSort}
        onSort={onSort}
        className="justify-end"
      />
    </div>
  );
}

function SortHeaderButton({ label, sortKey, columnSort, onSort, className = '' }) {
  const active = columnSort?.key === sortKey;
  const direction = active ? columnSort.direction : 'desc';

  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      className={`inline-flex items-center gap-1 transition-colors hover:text-slate-600 ${active ? 'text-slate-700' : ''} ${className}`}
      title={`Sort by ${label.toLowerCase()}`}
      aria-label={`Sort by ${label.toLowerCase()}`}
    >
      <span>{label}</span>
      <span
        className={`h-0 w-0 border-x-[3.5px] border-x-transparent transition-transform ${
          active ? 'border-b-[5px] border-b-slate-600' : 'border-b-[5px] border-b-slate-300'
        } ${direction === 'asc' ? 'rotate-180' : ''}`}
        aria-hidden="true"
      />
    </button>
  );
}

export function DeferNonTop10Modal({ taskCount, loading, onCancel, onConfirm }) {
  return (
    <div className="fixed inset-0 z-50 bg-slate-950/40 flex items-center justify-center px-4 py-6">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-md overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">Move all tasks outside today's Top 10 to tomorrow?</h2>
          <p className="text-sm text-slate-600 mt-2">
            The current first 10 visible tasks will stay as-is. The remaining {Math.max(taskCount - 10, 0)} task(s) will move to tomorrow.
          </p>
        </div>
        <div className="px-5 py-4 flex items-center justify-end gap-2 bg-slate-50">
          <button
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-lg font-medium transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Moving...' : 'Move to Tomorrow'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function OpportunityModal({
  opportunities,
  opportunityActions,
  goals,
  loading,
  error,
  onClose,
  onAccept,
  onDecline,
}) {
  return (
    <div className="fixed inset-0 z-50 bg-slate-950/40 flex items-center justify-center px-4 py-6">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Move-the-needle actions</h2>
            <p className="text-sm text-slate-600 mt-1">
              {loading
                ? "Alfred is looking for today's highest-leverage moves..."
                : "Choose what belongs on today's list."}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-800 p-2 rounded-lg hover:bg-slate-100"
            aria-label="Close recommendations"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="p-6 overflow-y-auto max-h-[calc(90vh-88px)]">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg mb-4">
              {error}
            </div>
          )}

          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center text-center">
              <div className="animate-spin rounded-full h-9 w-9 border-b-2 border-amber-500 mb-4"></div>
              <p className="text-slate-700 font-medium">Alfred is looking for today's highest-leverage moves...</p>
            </div>
          ) : opportunities.length === 0 && !error ? (
            <div className="text-center py-10 text-slate-600">
              No recommendations came back this time.
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {opportunities.map(opportunity => {
                const action = opportunityActions[opportunity.id];
                const goalTitle = opportunity.linked_goal_id
                  ? goals.find(goal => goal.id === opportunity.linked_goal_id)?.title
                  : null;

                return (
                  <div key={opportunity.id} className="border border-slate-200 rounded-lg p-4 flex flex-col min-h-[260px]">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <h3 className="font-semibold text-slate-900 leading-snug">{opportunity.title}</h3>
                      <span className="shrink-0 bg-slate-900 text-white text-sm font-semibold px-2 py-1 rounded-md">
                        {Number(opportunity.mtn_score || 0).toFixed(1)}
                      </span>
                    </div>

                    {opportunity.description && (
                      <p className="text-sm text-slate-700 mb-3">{opportunity.description}</p>
                    )}

                    {opportunity.rationale && (
                      <p className="text-sm text-slate-600 mb-4">{opportunity.rationale}</p>
                    )}

                    <div className="flex flex-wrap gap-2 mt-auto mb-4">
                      {opportunity.domain && (
                        <span className="text-xs bg-amber-50 text-amber-800 border border-amber-200 px-2 py-1 rounded-md">
                          {opportunity.domain}
                        </span>
                      )}
                      {goalTitle && (
                        <span className="text-xs bg-blue-50 text-blue-800 border border-blue-200 px-2 py-1 rounded-md">
                          {goalTitle}
                        </span>
                      )}
                    </div>

                    {action === 'accepted' ? (
                      <div className="bg-green-50 text-green-800 text-sm font-medium rounded-lg px-3 py-2 text-center">
                        Added to today
                      </div>
                    ) : action === 'declined' ? (
                      <div className="bg-slate-100 text-slate-700 text-sm font-medium rounded-lg px-3 py-2 text-center">
                        Declined
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <button
                          onClick={() => onAccept(opportunity.id)}
                          disabled={action === 'working'}
                          className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
                        >
                          Add to today
                        </button>
                        <button
                          onClick={() => onDecline(opportunity.id)}
                          disabled={action === 'working'}
                          className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
                        >
                          Decline
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function FollowUpModal({
  task,
  followUpDate,
  setFollowUpDate,
  todayKey,
  error,
  saving,
  onCancel,
  onConfirm
}) {
  const startDate = dateFromKey(todayKey) || new Date();
  const endDate = addDays(startDate, 29);
  const calendarDays = getRollingCalendarDays(startDate);
  const selectedDateLabel = followUpDate ? formatShortDate(followUpDate) : 'Choose a date';

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/40 flex items-center justify-center px-4 py-6">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-md overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Create Follow-Up</h2>
            <p className="text-sm text-slate-500 mt-1">Done for now. Remind me later.</p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="text-slate-500 hover:text-slate-800 p-1 rounded hover:bg-slate-100 disabled:opacity-50"
            aria-label="Close follow-up"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div>
            <p className="text-sm font-medium text-slate-700">Follow up on:</p>
            <p className="mt-1 text-base font-semibold text-slate-900 break-words">{task.title}</p>
          </div>

          <div>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-slate-700">Follow-up date</p>
                <p className="text-sm text-slate-500">{selectedDateLabel}</p>
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 p-3">
              <div className="mb-3 text-center text-sm font-semibold text-slate-900">
                {formatCalendarRangeLabel(startDate, endDate)}
              </div>
              <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase text-slate-400">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                  <div key={day} className="py-1">{day}</div>
                ))}
              </div>
              <div className="mt-1 grid grid-cols-7 gap-1">
                {calendarDays.map((date, index) => {
                  const key = date ? formatDateKey(date) : `empty-${index}`;
                  const isSelected = date && key === followUpDate;

                  return date ? (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setFollowUpDate(key)}
                      className={`aspect-square rounded text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                        isSelected
                          ? 'bg-blue-600 text-white hover:bg-blue-700'
                          : 'text-slate-700 hover:bg-slate-100'
                      }`}
                      title={formatMonthShort(date)}
                      aria-pressed={isSelected}
                      autoFocus={index === calendarDays.findIndex(Boolean)}
                    >
                      {date.getDate()}
                    </button>
                  ) : (
                    <div key={key} className="aspect-square" aria-hidden="true" />
                  );
                })}
              </div>
            </div>
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </div>
          )}
        </div>

        <div className="px-5 py-4 flex items-center justify-end gap-2 bg-slate-50">
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="px-4 py-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-lg font-medium transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={saving}
            className="px-5 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Creating...' : 'OK'}
          </button>
        </div>
      </div>
    </div>
  );
}
