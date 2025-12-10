import React, { useState } from 'react';
import { PRIORITY_COLORS, getDateBadgeColor, formatDateBadge, formatDateForInput } from '../utils/dateUtils';

export default function TaskItem({ task, index, onUpdate, onDelete, onToggle }) {
  const [isEditing, setIsEditing] = useState(false);
  const [showContext, setShowContext] = useState(false);
  const [editData, setEditData] = useState({
    title: task.title,
    notes: task.notes || '',
    due_date: task.due_date,
    priority: task.priority,
  });

  const isCompleted = task.status === 'completed';
  const priorityColor = PRIORITY_COLORS[task.priority] || PRIORITY_COLORS.Medium;
  const dateBadgeColor = getDateBadgeColor(task.due_date);
  const dateBadgeText = formatDateBadge(task.due_date);

  const handleSave = () => {
    onUpdate(task.id, editData);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditData({
      title: task.title,
      notes: task.notes || '',
      due_date: task.due_date,
      priority: task.priority,
    });
    setIsEditing(false);
  };

  return (
    <div className={`border rounded-lg p-4 transition-all ${
      isCompleted ? 'bg-gray-50 opacity-60' : 'bg-white'
    } hover:shadow-md`}>
      <div className="flex items-start gap-3">
        {/* Task number */}
        <div className="flex-shrink-0 w-6 text-sm font-medium text-gray-500 mt-2">
          {index}
        </div>

        {/* Checkbox */}
        <div className="flex-shrink-0 mt-2">
          <input
            type="checkbox"
            checked={isCompleted}
            onChange={() => onToggle(task.id)}
            className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
          />
        </div>

        {/* Priority flag */}
        <div className="flex-shrink-0 mt-1">
          <select
            value={editData.priority}
            onChange={(e) => {
              const newPriority = e.target.value;
              setEditData({ ...editData, priority: newPriority });
              if (!isEditing) {
                onUpdate(task.id, { ...editData, priority: newPriority });
              }
            }}
            className="text-2xl bg-transparent border-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 rounded px-1"
          >
            {Object.entries(PRIORITY_COLORS).map(([priority, { flag }]) => (
              <option key={priority} value={priority}>
                {flag} {priority}
              </option>
            ))}
          </select>
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0">
          {isEditing ? (
            <>
              <input
                type="text"
                value={editData.title}
                onChange={(e) => setEditData({ ...editData, title: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Task title"
              />
              
              {showContext && (
                <textarea
                  value={editData.notes}
                  onChange={(e) => setEditData({ ...editData, notes: e.target.value })}
                  className="w-full mt-2 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Add context..."
                  rows="2"
                />
              )}
            </>
          ) : (
            <>
              <div className={`text-base font-medium ${isCompleted ? 'line-through text-gray-500' : 'text-gray-900'}`}>
                {task.title}
              </div>
              
              {/* Date badge and context */}
              <div className="mt-1 flex items-center gap-2 flex-wrap">
                {task.due_date && (
                  <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium text-white ${dateBadgeColor}`}>
                    {dateBadgeText}
                  </span>
                )}
                {showContext && task.notes && (
                  <span className="text-sm text-gray-600">• {task.notes}</span>
                )}
              </div>
            </>
          )}
        </div>

        {/* Due date picker (when editing) */}
        {isEditing && (
          <div className="flex-shrink-0">
            <input
              type="date"
              value={formatDateForInput(editData.due_date)}
              onChange={(e) => setEditData({ ...editData, due_date: e.target.value })}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
            />
          </div>
        )}

        {/* Action buttons */}
        <div className="flex-shrink-0 flex items-center gap-1">
          <button
            onClick={() => setShowContext(!showContext)}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
            title={showContext ? 'Hide context' : 'Show context'}
          >
            {showContext ? '👁️' : '🔍'}
          </button>

          {isEditing ? (
            <>
              <button
                onClick={handleSave}
                className="p-2 text-green-600 hover:text-green-700 hover:bg-green-50 rounded transition-colors"
                title="Save"
              >
                ✓
              </button>
              <button
                onClick={handleCancel}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
                title="Cancel"
              >
                ✕
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setIsEditing(true)}
                className="p-2 text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded transition-colors"
                title="Edit"
              >
                ✏️
              </button>
              <button
                onClick={() => onDelete(task.id)}
                className="p-2 text-red-600 hover:text-red-700 hover:bg-red-50 rounded transition-colors"
                title="Delete"
              >
                🗑️
              </button>
            </>
          )}
        </div>
      </div>

      {/* Expanded context view */}
      {showContext && !isEditing && task.notes && (
        <div className="mt-3 ml-14 p-3 bg-gray-50 rounded-lg text-sm text-gray-700">
          {task.notes}
        </div>
      )}
    </div>
  );
}
