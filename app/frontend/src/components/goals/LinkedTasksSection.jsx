import { useLanguage } from '../../i18n/LanguageContext';
import { formatDueDate as formatTaskDueDate, isOverdueET } from '../../utils/taskHelpers';

/* =========================================================
   PRIORITY HELPERS
   ========================================================= */

const getPriorityColor = (priority) => {
  const colors = {
    High: 'text-red-600 bg-red-50 border-red-200',
    Medium: 'text-orange-600 bg-orange-50 border-orange-200',
    Low: 'text-green-600 bg-green-50 border-green-200'
  };
  return colors[priority] || 'text-slate-600 bg-slate-50 border-slate-200';
};

const getPriorityIcon = (priority) => {
  const icons = {
    High: '🔴',
    Medium: '🟠',
    Low: '🟢'
  };
  return icons[priority] || '⚪';
};

export default function LinkedTasksSection({ tasks }) {
  const { timezone } = useLanguage();

  if (!tasks || tasks.length === 0) {
    return (
      <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-center">
        <p className="text-sm text-slate-500">No linked tasks</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {tasks.map(task => (
        <div 
          key={task.id}
          className={`p-3 rounded-lg border transition-all ${
            task.status === 'completed'
              ? 'bg-slate-50 border-slate-200'
              : 'bg-white border-slate-300'
          }`}
        >
          <div className="flex items-start gap-3">
            {/* Checkbox */}
            <div className="pt-0.5">
              {task.status === 'completed' ? (
                <span className="text-green-600">✅</span>
              ) : (
                <span className="text-slate-300">☐</span>
              )}
            </div>

            {/* Task content */}
            <div className="flex-1 min-w-0">
              <div className={`font-medium ${
                task.status === 'completed'
                  ? 'text-slate-400 line-through'
                  : 'text-slate-800'
              }`}>
                {task.title}
              </div>

              {/* Metadata */}
              <div className="flex flex-wrap gap-2 mt-1.5">
                {/* Priority */}
                <span className={`text-xs px-2 py-0.5 rounded border ${getPriorityColor(task.priority)}`}>
                  {getPriorityIcon(task.priority)} {task.priority}
                </span>

                {/* Due date */}
                {task.due_date && (
                  <span className={`text-xs px-2 py-0.5 rounded border ${
                    isOverdueET(task.due_date, timezone)
                      ? 'text-red-600 bg-red-50 border-red-200'
                      : 'text-blue-600 bg-blue-50 border-blue-200'
                  }`}>
                    📅 {formatTaskDueDate(task.due_date, timezone)}
                  </span>
                )}

                {/* Project */}
                {task.project && (
                  <span className="text-xs px-2 py-0.5 rounded border text-purple-600 bg-purple-50 border-purple-200">
                    📁 {task.project}
                  </span>
                )}

                {/* Delegated */}
                {task.delegated_to && (
                  <span className="text-xs px-2 py-0.5 rounded border text-indigo-600 bg-indigo-50 border-indigo-200">
                    👤 {task.delegated_to}
                  </span>
                )}
              </div>

              {/* Notes */}
              {task.notes && task.status !== 'completed' && (
                <p className="text-sm text-slate-600 mt-2 line-clamp-2">
                  {task.notes}
                </p>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
