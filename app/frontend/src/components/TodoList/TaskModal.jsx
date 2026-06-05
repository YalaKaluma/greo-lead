// frontend/src/components/TodoList/TaskModal.jsx
import { getTodayET, getETDate, formatDateForInput, formatDateForDisplay, normalizeDateString, getNextMonday, getSortedGoals, getGoalIndentation } from '../../utils/taskHelpers';
import { useState, useEffect } from 'react';
import VoiceRecorder from '../VoiceRecorder';

/**
 * TaskModal Component
 * 
 * Modal for adding new tasks or editing existing ones.
 * Features:
 * - Full task editing (title, due date, priority, goal, delegate, notes)
 * - Quick date picker with presets (tomorrow, next Monday, next month)
 * - Delete functionality for existing tasks
 * - Goal selection with hierarchical display
 * - Delegate autocomplete
 */
export default function TaskModal({ task, onSave, onCancel, onDelete, delegates, goals, timezone }) {
  const isEditing = !!task;
  const weekdayOptions = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  
  const [editData, setEditData] = useState({
    title: task?.title || '',
    delegated_to: task?.delegated_to || '',
    due_date: task?.due_date ? normalizeDateString(task.due_date) : getTodayET(timezone),
    priority: task?.priority?.toLowerCase() || 'medium',
    notes: task?.notes || '',
    goal_id: task?.goal_id || null,
    is_recurring: Boolean(task?.is_recurring),
    recurrence_type: task?.recurrence_type || 'weekly',
    recurrence_interval: task?.recurrence_interval || 1,
    recurrence_day_of_week: task?.recurrence_day_of_week || 'Monday',
    recurrence_day_of_month: task?.recurrence_day_of_month || 1,
    recurrence_end_date: task?.recurrence_end_date || ''
  });

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [alfredInsights, setAlfredInsights] = useState(null);
  const [showAlfredInsights, setShowAlfredInsights] = useState(false);
  const [alfredLoading, setAlfredLoading] = useState(false);

  useEffect(() => {

    // Reload Alfred insights if task was AI enriched
    if (task?.ai_enriched) {

      setAlfredInsights({
        strategic_intent: task.strategic_intent,
        move_the_needle_score: task.move_the_needle_score,
        estimated_effort: task.estimated_effort,

        suggested_subtasks: task.suggested_subtasks || [],
        alfred_help: task.alfred_help || [],

        enhanced_title: task.enhanced_title
      });

    } else {

      setAlfredInsights(null);

    }

  }, [task]);

  const setTomorrow = () => {
    const tomorrow = getETDate(timezone);
    tomorrow.setDate(tomorrow.getDate() + 1);
    setEditData({ ...editData, due_date: formatDateForInput(tomorrow) });
    setShowDatePicker(false);
  };

  const setNextWeek = () => {
    setEditData({ ...editData, due_date: getNextMonday(timezone) });
    setShowDatePicker(false);
  };

  const setNextMonth = () => {
    const nextMonth = getETDate(timezone);
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    setEditData({ ...editData, due_date: formatDateForInput(nextMonth) });
    setShowDatePicker(false);
  };

  const handleSave = () => {
    if (!editData.title.trim()) {
      alert('Please enter a task title');
      return;
    }
    const recurrenceUpdateScope = isEditing && task?.is_recurring
      ? (confirm('Apply these changes to future recurring tasks too? Choose OK for future tasks, or Cancel for only this task.')
        ? 'future'
        : 'this')
      : null;
//    onSave(editData);
    onSave({
      ...editData,
      recurrence_update_scope: recurrenceUpdateScope,
      recurrence_interval: editData.is_recurring ? Number(editData.recurrence_interval || 1) : null,
      recurrence_day_of_month: editData.is_recurring && editData.recurrence_type === 'monthly'
        ? Number(editData.recurrence_day_of_month || 1)
        : null,
      recurrence_day_of_week: editData.is_recurring && editData.recurrence_type === 'weekly'
        ? editData.recurrence_day_of_week
        : null,
      recurrence_end_date: editData.is_recurring && editData.recurrence_end_date
        ? editData.recurrence_end_date
        : null,

      strategic_intent: alfredInsights?.strategic_intent,
      move_the_needle_score: alfredInsights?.move_the_needle_score,
      estimated_effort: alfredInsights?.estimated_effort,

      suggested_subtasks: alfredInsights?.suggested_subtasks,
      alfred_help: alfredInsights?.alfred_help,

      enhanced_title: alfredInsights?.enhanced_title,

      ai_enriched: !!alfredInsights
    });
  };

  const handleDelete = () => {
    if (confirm('Delete this task?')) {
      onDelete();
    }
  };

  const handleAskAlfred = async () => {
  if (!editData.title.trim()) {
    alert('Please enter a task title first');
    return;
  }

  setAlfredLoading(true);

  try {
    const response = await fetch('/api/tasks/enrich', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: editData.title,
        notes: editData.notes,
        goal_id: editData.goal_id
      })
    });

    const data = await response.json();

    setAlfredInsights(data);




  } catch (error) {
  console.error('FULL ERROR:', error);

  if (error?.stack) {
    console.error(error.stack);
  }

  alert(JSON.stringify(error, null, 2));
} finally {
    setAlfredLoading(false);
  }
};

  return (
    <>
      <div 
        className="fixed inset-0 bg-black bg-opacity-50 z-40"
        onClick={onCancel}
      />
      
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto">
          <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
            <h2 className="text-xl font-semibold text-slate-800">
              {isEditing ? 'Edit Task' : 'Add Task'}
            </h2>
            <button
              onClick={onCancel}
              className="text-slate-400 hover:text-slate-600 text-2xl leading-none"
            >
              ×
            </button>
          </div>

          <div className="p-4 space-y-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-sm font-medium text-slate-700">
                  Task Title
                </label>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleAskAlfred}
                    disabled={alfredLoading}
                    className="text-sm px-3 py-1 bg-purple-100 hover:bg-purple-200 text-purple-700 rounded-lg transition-colors disabled:opacity-50"
                  >
                  {alfredLoading ? 'Analyzing...' : '✨ Ask Alfred'}
                  </button>
                  <VoiceRecorder
                    onTranscript={(text) => setEditData(prev => ({ ...prev, title: text }))}
                    className="justify-end"
                    size="compact"
                  />
                </div>
              </div>

              









              <input
                type="text"
                value={editData.title}
                onChange={(e) => setEditData({ ...editData, title: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-base"
                placeholder="What needs to be done?"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Due Date</label>
              <div className="relative">
                <div 
                  onClick={() => setShowDatePicker(!showDatePicker)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white cursor-pointer hover:border-blue-400 transition-colors flex items-center justify-between"
                >
                  <span className={editData.due_date ? 'text-slate-800' : 'text-slate-400'}>
                    {editData.due_date ? formatDateForDisplay(editData.due_date, { 
                      weekday: 'short', 
                      month: 'short', 
                      day: 'numeric',
                      year: 'numeric'
                    }) : 'No due date'}
                  </span>
                  <span className="text-slate-400">📅</span>
                </div>

                {showDatePicker && (
                  <div 
                    className="absolute z-10 mt-2 w-full bg-white border border-gray-200 rounded-lg shadow-lg"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="p-2 space-y-1">
                      <button
                        onClick={setTomorrow}
                        className="w-full text-left px-3 py-2 hover:bg-slate-50 rounded text-sm text-slate-700"
                      >
                        🗓️ Tomorrow
                      </button>
                      <button
                        onClick={setNextWeek}
                        className="w-full text-left px-3 py-2 hover:bg-slate-50 rounded text-sm text-slate-700"
                      >
                        📆 Next Monday
                      </button>
                      <button
                        onClick={setNextMonth}
                        className="w-full text-left px-3 py-2 hover:bg-slate-50 rounded text-sm text-slate-700"
                      >
                        🗓️ Next Month
                      </button>
                    </div>

                    <div className="border-t border-gray-200 p-2">
                      <input
                        type="date"
                        value={editData.due_date}
                        onChange={(e) => {
                          setEditData({ ...editData, due_date: e.target.value });
                          setShowDatePicker(false);
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Priority</label>
              <select
                value={editData.priority}
                onChange={(e) => setEditData({ ...editData, priority: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="high">🔴 High Priority</option>
                <option value="medium">🟠 Medium Priority</option>
                <option value="low">🟢 Low Priority</option>
              </select>
            </div>

            <div className="rounded-lg border border-gray-200 bg-slate-50 p-3">
              <label className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-slate-700">Recurring task</span>
                <input
                  type="checkbox"
                  checked={editData.is_recurring}
                  onChange={(e) => setEditData({ ...editData, is_recurring: e.target.checked })}
                  className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
              </label>

              {editData.is_recurring && (
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Frequency</label>
                    <select
                      value={editData.recurrence_type}
                      onChange={(e) => setEditData({ ...editData, recurrence_type: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    >
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                      <option value="monthly">Monthly</option>
                      <option value="interval_days">Custom days</option>
                      <option value="custom">Custom interval</option>
                    </select>
                  </div>

                  {editData.recurrence_type !== 'daily' && (
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        {editData.recurrence_type === 'weekly' ? 'Every X weeks' : 'Interval'}
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={editData.recurrence_interval}
                        onChange={(e) => setEditData({ ...editData, recurrence_interval: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  )}

                  {editData.recurrence_type === 'weekly' && (
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Day</label>
                      <select
                        value={editData.recurrence_day_of_week}
                        onChange={(e) => setEditData({ ...editData, recurrence_day_of_week: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                      >
                        {weekdayOptions.map(day => (
                          <option key={day} value={day}>{day}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {editData.recurrence_type === 'monthly' && (
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Day of month</label>
                      <input
                        type="number"
                        min="1"
                        max="31"
                        value={editData.recurrence_day_of_month}
                        onChange={(e) => setEditData({ ...editData, recurrence_day_of_month: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  )}

                  {['interval_days', 'custom'].includes(editData.recurrence_type) && (
                    <div className="text-xs text-slate-500 flex items-end pb-2">
                      Creates the next task every {editData.recurrence_interval || 1} day(s).
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">End date</label>
                    <input
                      type="date"
                      value={editData.recurrence_end_date || ''}
                      onChange={(e) => setEditData({ ...editData, recurrence_end_date: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Goal</label>
              <select
                value={editData.goal_id || ''}
                onChange={(e) => setEditData({ ...editData, goal_id: e.target.value ? parseInt(e.target.value) : null })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="">No goal</option>
                {getSortedGoals(goals).map(g => {
                  const displayText = g.title || g.goal_text;
                  const truncatedText = displayText.length > 50 ? displayText.substring(0, 50) + '...' : displayText;
                  const indentation = getGoalIndentation(g.time_horizon);
                  return <option key={g.id} value={g.id}>{indentation}{truncatedText}</option>;
                })}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Delegate To</label>
              <input
                type="text"
                value={editData.delegated_to}
                onChange={(e) => setEditData({ ...editData, delegated_to: e.target.value })}
                list="modal-delegate-list"
                placeholder="No one"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <datalist id="modal-delegate-list">
                {delegates.map(d => <option key={d} value={d} />)}
              </datalist>
            </div>

            <div>

{alfredInsights && (

  <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 space-y-4">

    <button
      onClick={() => setShowAlfredInsights(!showAlfredInsights)}
      className="w-full flex items-center justify-between"
    >

      <div className="flex items-center gap-2">

        <span className="text-purple-700 text-sm">
          {showAlfredInsights ? '▼' : '▶'}
        </span>

        <h3 className="font-semibold text-purple-900">
          ✨ Alfred Insights
        </h3>

      </div>

      <div className="text-sm font-medium text-purple-700">
        Move the Needle: {alfredInsights.move_the_needle_score}/10
      </div>

    </button>

    {showAlfredInsights && (

      <>

        <div>
          <div className="text-xs uppercase text-slate-500 mb-1">
            Suggested Title
          </div>

          <div className="flex items-center justify-between gap-2">

            <div className="text-sm text-slate-700 font-medium">
              {alfredInsights.enhanced_title}
            </div>

            <button
              onClick={() =>
                setEditData({
                  ...editData,
                  title: alfredInsights.enhanced_title
                })
              }
              className="text-xs px-2 py-1 bg-purple-100 hover:bg-purple-200 text-purple-700 rounded-md"
            >
              Apply
            </button>

          </div>
        </div>

        <div>
          <div className="text-xs uppercase text-slate-500 mb-1">
            Strategic Intent
          </div>

          <div className="text-sm text-slate-700">
            {alfredInsights.strategic_intent}
          </div>
        </div>

        <div>
          <div className="text-xs uppercase text-slate-500 mb-1">
            Estimated Effort
          </div>

          <div className="text-sm text-slate-700">
            {alfredInsights.estimated_effort}
          </div>
        </div>

        <div>
          <div className="text-xs uppercase text-slate-500 mb-1">
            Suggested Subtasks
          </div>

          <ul className="space-y-1">
            {(alfredInsights.suggested_subtasks || []).map((task, index) => (
              <li key={index} className="text-sm text-slate-700">
                • {task}
              </li>
            ))}
          </ul>
        </div>

        <div>
          <div className="text-xs uppercase text-slate-500 mb-1">
            How Alfred Can Help
          </div>

          <ul className="space-y-1">
            {(alfredInsights.alfred_help || []).map((help, index) => (
              <li key={index} className="text-sm text-slate-700">
                • {help}
              </li>
            ))}
          </ul>
        </div>

      </>

    )}

  </div>

)}

              
              <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
              <textarea
                value={editData.notes}
                onChange={(e) => setEditData({ ...editData, notes: e.target.value })}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                placeholder="Add any additional details..."
              />
            </div>
          </div>

          <div className="sticky bottom-0 bg-slate-50 border-t border-gray-200 px-4 py-3 flex items-center justify-between">
            {isEditing ? (
              <button
                onClick={handleDelete}
                className="px-4 py-2 bg-white border border-red-300 hover:bg-red-50 text-red-600 rounded-lg font-medium transition-colors"
              >
                Delete
              </button>
            ) : (
              <div></div>
            )}
            <div className="flex gap-2">
              <button
                onClick={onCancel}
                className="px-4 py-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-lg font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
              >
                {isEditing ? 'Save Changes' : 'Add Task'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
