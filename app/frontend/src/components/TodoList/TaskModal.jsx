// frontend/src/components/TodoList/TaskModal.jsx
import { useState } from 'react';
import { getTodayET, getETDate, getNextMonday, getSortedGoals, getGoalIndentation } from '../../utils/taskHelpers';

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
export default function TaskModal({ task, onSave, onCancel, onDelete, delegates, goals }) {
  const isEditing = !!task;
  
  const [editData, setEditData] = useState({
    title: task?.title || '',
    delegated_to: task?.delegated_to || '',
    due_date: task?.due_date || getTodayET(),
    priority: task?.priority?.toLowerCase() || 'medium',
    notes: task?.notes || '',
    goal_id: task?.goal_id || null
  });

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [alfredInsights, setAlfredInsights] = useState(null);
  const [alfredLoading, setAlfredLoading] = useState(false);

  const setTomorrow = () => {
    const tomorrow = getETDate();  // Use ET instead of new Date()
    tomorrow.setDate(tomorrow.getDate() + 1);
    setEditData({ ...editData, due_date: tomorrow.toISOString().split('T')[0] });
    setShowDatePicker(false);
  };

  const setNextWeek = () => {
    setEditData({ ...editData, due_date: getNextMonday() });
    setShowDatePicker(false);
  };

  const setNextMonth = () => {
    const nextMonth = getETDate();  // Use ET instead of new Date()
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    setEditData({ ...editData, due_date: nextMonth.toISOString().split('T')[0] });
    setShowDatePicker(false);
  };

  const handleSave = () => {
    if (!editData.title.trim()) {
      alert('Please enter a task title');
      return;
    }
    onSave(editData);
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
    // MOCK DATA FOR NOW
    const mockInsights = {
      strategic_intent: "Validate VTM logic accuracy before Savencia rollout",
      move_the_needle_score: 9.1,
      estimated_effort: "4-6 hours",
      suggested_subtasks: [
        "Validate SKU mappings",
        "Compare transfer outputs",
        "Test edge cases",
        "Document anomalies"
      ],
      alfred_help: [
        "Generate test cases",
        "Analyze anomalies",
        "Draft validation summary"
      ],
      priority_suggestion: "high"
    };

    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 1000));

    setAlfredInsights(mockInsights);

  } catch (error) {
    console.error('Error enriching task:', error);
    alert('Failed to analyze task');
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

                <button
                  onClick={handleAskAlfred}
                  disabled={alfredLoading}
                  className="text-sm px-3 py-1 bg-purple-100 hover:bg-purple-200 text-purple-700 rounded-lg transition-colors disabled:opacity-50"
                >
                  {alfredLoading ? 'Analyzing...' : '✨ Ask Alfred'}
                </button>
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
                    {editData.due_date ? new Date(editData.due_date).toLocaleDateString('en-US', { 
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
                <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 space-y-3">
                  
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-purple-900">
                      ✨ Alfred Insights
                    </h3>

                    <div className="text-sm font-medium text-purple-700">
                      Move the Needle: {alfredInsights.move_the_needle_score}/10
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
                      {alfredInsights.suggested_subtasks.map((task, index) => (
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
                      {alfredInsights.alfred_help.map((help, index) => (
                        <li key={index} className="text-sm text-slate-700">
                          • {help}
                        </li>
                      ))}
                    </ul>
                  </div>

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

