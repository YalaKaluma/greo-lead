// frontend/src/components/TodoList/BulkActionModal.jsx
import { useState } from 'react';
import { getTodayET, getETDate, formatDateForInput, formatDateForDisplay, getNextMonday } from '../../utils/taskHelpers';

/**
 * BulkActionModal Component
 * 
 * Modal for editing multiple selected tasks at once.
 * Features:
 * - Bulk update due date, priority, goal, and delegate
 * - Only updates fields that user selects
 * - Quick date picker with presets
 * - Shows count of selected tasks
 */
export default function BulkActionModal({ selectedCount, onApply, onCancel, delegates, goals, timezone }) {
  const [bulkData, setBulkData] = useState({
    due_date: '',
    priority: '',
    goal_id: '',
    delegated_to: ''
  });

  const [showDatePicker, setShowDatePicker] = useState(false);

  const setToday = () => {
    setBulkData({ ...bulkData, due_date: getTodayET(timezone) });
    setShowDatePicker(false);
  };

  const setTomorrow = () => {
    const tomorrow = getETDate(timezone);
    tomorrow.setDate(tomorrow.getDate() + 1);
    setBulkData({ ...bulkData, due_date: formatDateForInput(tomorrow) });
    setShowDatePicker(false);
  };

  const setNextMonday = () => {
    setBulkData({ ...bulkData, due_date: getNextMonday(timezone) });
    setShowDatePicker(false);
  };

  const setNextMonth = () => {
    const nextMonth = getETDate(timezone);
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    setBulkData({ ...bulkData, due_date: formatDateForInput(nextMonth) });
    setShowDatePicker(false);
  };

  const handleApply = () => {
    const updates = {};
    if (bulkData.due_date) updates.due_date = bulkData.due_date;
    if (bulkData.priority) updates.priority = bulkData.priority;
    if (bulkData.goal_id) updates.goal_id = parseInt(bulkData.goal_id);
    if (bulkData.delegated_to) updates.delegated_to = bulkData.delegated_to;

    if (Object.keys(updates).length === 0) {
      alert('Please select at least one field to update');
      return;
    }

    onApply(updates);
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
              Edit {selectedCount} Task{selectedCount > 1 ? 's' : ''}
            </h2>
            <button
              onClick={onCancel}
              className="text-slate-400 hover:text-slate-600 text-2xl leading-none"
            >
              ×
            </button>
          </div>

          <div className="p-4 space-y-3">
            <p className="text-sm text-slate-600 mb-4">
              Select the fields you want to update. Only selected fields will be changed.
            </p>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Due Date</label>
              <div className="relative">
                <div 
                  onClick={() => setShowDatePicker(!showDatePicker)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white cursor-pointer hover:border-blue-400 transition-colors flex items-center justify-between"
                >
                  <span className={bulkData.due_date ? 'text-slate-800' : 'text-slate-400'}>
                    {bulkData.due_date ? formatDateForDisplay(bulkData.due_date, { 
                      weekday: 'short', 
                      month: 'short', 
                      day: 'numeric',
                      year: 'numeric'
                    }) : 'Leave unchanged'}
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
                        onClick={setToday}
                        className="w-full text-left px-3 py-2 hover:bg-slate-50 rounded text-sm text-slate-700"
                      >
                        📅 Today
                      </button>
                      <button
                        onClick={setTomorrow}
                        className="w-full text-left px-3 py-2 hover:bg-slate-50 rounded text-sm text-slate-700"
                      >
                        🗓️ Tomorrow
                      </button>
                      <button
                        onClick={setNextMonday}
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
                        value={bulkData.due_date}
                        onChange={(e) => {
                          setBulkData({ ...bulkData, due_date: e.target.value });
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
                value={bulkData.priority}
                onChange={(e) => setBulkData({ ...bulkData, priority: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="">Leave unchanged</option>
                <option value="high">🔴 High Priority</option>
                <option value="medium">🟠 Medium Priority</option>
                <option value="low">🟢 Low Priority</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Goal</label>
              <select
                value={bulkData.goal_id}
                onChange={(e) => setBulkData({ ...bulkData, goal_id: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="">Leave unchanged</option>
                {goals.map(g => {
                  const displayText = g.title || g.goal_text;
                  const truncatedText = displayText.length > 50 ? displayText.substring(0, 50) + '...' : displayText;
                  return <option key={g.id} value={g.id}>{truncatedText}</option>;
                })}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Delegate To</label>
              <input
                type="text"
                value={bulkData.delegated_to}
                onChange={(e) => setBulkData({ ...bulkData, delegated_to: e.target.value })}
                list="bulk-delegate-list"
                placeholder="Leave unchanged"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <datalist id="bulk-delegate-list">
                {delegates.map(d => <option key={d} value={d} />)}
              </datalist>
            </div>
          </div>

          <div className="sticky bottom-0 bg-slate-50 border-t border-gray-200 px-4 py-3 flex items-center justify-end gap-2">
            <button
              onClick={onCancel}
              className="px-4 py-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-lg font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleApply}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
            >
              Apply to {selectedCount} Task{selectedCount > 1 ? 's' : ''}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
