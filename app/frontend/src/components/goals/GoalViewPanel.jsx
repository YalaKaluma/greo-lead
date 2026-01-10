import LinkedTasksSection from './LinkedTasksSection';

/* =========================================================
   TIME HORIZON HELPERS
   ========================================================= */

const getHorizonLabel = (horizon) => {
  const labels = {
    long: 'Long Term Goal',
    medium: 'Medium Term Goal',
    short: 'Short Term Goal'
  };
  return labels[horizon] || 'Goal';
};

const getHorizonColor = (horizon) => {
  const colors = {
    long: 'bg-purple-100 text-purple-800 border-purple-200',
    medium: 'bg-blue-100 text-blue-800 border-blue-200',
    short: 'bg-green-100 text-green-800 border-green-200'
  };
  return colors[horizon] || 'bg-slate-100 text-slate-800 border-slate-200';
};

/* =========================================================
   MAIN COMPONENT
   ========================================================= */

export default function GoalViewPanel({ goal, linkedTasks, onClose, onEdit, onCreateChildGoal }) {
  return (
    <div className="fixed lg:absolute top-0 right-0 bottom-0 w-full lg:w-[600px] bg-white shadow-2xl z-40 flex flex-col">
      {/* Header with close button */}
      <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <h2 className="text-xl font-semibold text-slate-800">Goal Details</h2>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-600 transition-colors p-1"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        
        {/* Time Horizon Badge */}
        <div>
          <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium border ${getHorizonColor(goal.time_horizon)}`}>
            {getHorizonLabel(goal.time_horizon)}
          </span>
        </div>

        {/* Title */}
        <div>
          <h3 className="text-2xl font-bold text-slate-800 mb-2">
            {goal.title || 'Untitled Goal'}
          </h3>
        </div>
        
        {/* Description */}
        {goal.goal_text && (
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
              Description
            </label>
            <p className="text-slate-700 leading-relaxed whitespace-pre-wrap">
              {goal.goal_text}
            </p>
          </div>
        )}
        
        {/* Why - Highlighted */}
        {goal.why && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <label className="block text-xs font-semibold text-blue-700 uppercase tracking-wider mb-2">
              Why This Matters
            </label>
            <p className="text-blue-900 leading-relaxed whitespace-pre-wrap">
              {goal.why}
            </p>
          </div>
        )}

        {/* Linked Tasks */}
        {linkedTasks.length > 0 && (
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
              Linked Tasks ({linkedTasks.length})
            </label>
            <LinkedTasksSection tasks={linkedTasks} />
          </div>
        )}

        {linkedTasks.length === 0 && (
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-center">
            <p className="text-sm text-slate-500">No tasks linked to this goal yet</p>
          </div>
        )}
      </div>

      {/* Footer with action buttons */}
      <div className="sticky bottom-0 bg-white border-t border-slate-200 px-6 py-4 space-y-3">
        <button
          onClick={() => onEdit(goal)}
          className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
        >
          Edit Goal
        </button>
        
        <button
          onClick={() => onCreateChildGoal(goal.id)}
          className="w-full px-4 py-3 bg-white border-2 border-slate-300 hover:border-slate-400 text-slate-700 rounded-lg font-medium transition-colors"
        >
          + Create Child Goal
        </button>
      </div>
    </div>
  );
}
