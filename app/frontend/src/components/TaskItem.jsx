import React, { useState, useRef, useEffect } from 'react';
import { PRIORITY_COLORS, getDateBadgeColor, formatDateBadge, formatDateForInput } from '../utils/dateUtils';

export default function TaskItem({ 
  task, 
  index, 
  taskNumber,
  onUpdate, 
  onDelete, 
  onToggle,
  onDragStart,
  onDragOver,
  onDragEnd,
  isDragging,
  projects,
  delegates
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showDelegateForm, setShowDelegateForm] = useState(false);
  const [delegateInput, setDelegateInput] = useState('');
  const itemRef = useRef(null);
  const scrollPositionRef = useRef(0);
  
  const [editData, setEditData] = useState({
    title: task.title,
    notes: task.notes || '',
    due_date: task.due_date,
    priority: task.priority,
    project: task.project || '',
    delegated_to: task.delegated_to || '',
  });

  const isCompleted = task.status === 'completed';
  const isCompletedToday = isCompleted && task.updated_at && 
    new Date(task.updated_at).toDateString() === new Date().toDateString();
  
  const priorityColor = PRIORITY_COLORS[task.priority] || PRIORITY_COLORS.Medium;
  const dateBadgeColor = getDateBadgeColor(task.due_date);
  const dateBadgeText = formatDateBadge(task.due_date);

  const shouldShowStrikethrough = isCompletedToday;

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
      project: task.project || '',
      delegated_to: task.delegated_to || '',
    });
    setIsEditing(false);
  };

  const handleDateChange = (newDate) => {
    const updatedData = { ...editData, due_date: newDate };
    setEditData(updatedData);
    if (!isEditing) {
      onUpdate(task.id, { due_date: newDate });
    }
    setShowDatePicker(false);
  };

  const handlePriorityChange = (newPriority) => {
    const updatedData = { ...editData, priority: newPriority };
    setEditData(updatedData);
    if (!isEditing) {
      onUpdate(task.id, { priority: newPriority });
    }
  };

  const handleDelegateSubmit = () => {
    if (delegateInput.trim()) {
      onUpdate(task.id, { delegated_to: delegateInput.trim() });
      setDelegateInput('');
      setShowDelegateForm(false);
    }
  };

  const handleToggle = () => {
    scrollPositionRef.current = window.scrollY;
    onToggle(task.id);
  };

  useEffect(() => {
    if (scrollPositionRef.current > 0) {
      window.scrollTo(0, scrollPositionRef.current);
    }
  }, [task.status]);

  return (
    <div 
      ref={itemRef}
      draggable
      onDragStart={() => onDragStart(index)}
      onDragOver={(e) => onDragOver(e, index)}
      onDragEnd={onDragEnd}
      className={`border-b border-slate-100 p-2 transition-all cursor-move hover:bg-slate-50 ${
        isDragging ? 'opacity-50 scale-98' : ''
      } ${shouldShowStrikethrough ? 'bg-green-50' : ''}`}
    >
      <div className="flex items-center gap-2">
        <div className="flex-shrink-0 text-slate-300 hover:text-slate-500 cursor-grab active:cursor-grabbing text-xs">
          ⋮⋮
        </div>
        <div className="flex-shrink-0 w-8 text-xs font-medium text-slate-500">
          {taskNumber}
        </div>
        <div className="flex-shrink-0">
          <input
            type="checkbox"
            checked={isCompleted}
            onChange={handleToggle}
            className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
          />
        </div>
        <div className="flex-shrink-0">
          <select
            value={editData.priority}
            onChange={(e) => handlePriorityChange(e.target.value)}
            className="text-lg bg-transparent border-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-500 rounded appearance-none p-0"
            style={{ width: '30px' }}
          >
            {Object.entries(PRIORITY_COLORS).map(([priority, { flag }]) => (
              <option key={priority} value={priority}>
                {flag}
              </option>
            ))}
          </select>
        </div>
        <div className="flex-1 min-w-0">
          {isEditing ? (
            <div className="space-y-1">
              <input
                type="text"
                value={editData.title}
                onChange={(e) => setEditData({ ...editData, title: e.target.value })}
                className="w-full px-2 py-1 text-sm border border-slate-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-transparent"
                placeholder="Task title"
              />
              <div className="flex gap-2">
                <input
                  type="text"
                  value={editData.project}
                  onChange={(e) => setEditData({ ...editData, project: e.target.value })}
                  list="projects-list"
                  className="flex-1 px-2 py-1 text-xs border border-slate-300 rounded focus:ring-1 focus:ring-blue-500"
                  placeholder="Project"
                />
                <datalist id="projects-list">
                  {projects.map(p => <option key={p} value={p} />)}
                </datalist>
                <input
                  type="date"
                  value={formatDateForInput(editData.due_date)}
                  onChange={(e) => setEditData({ ...editData, due_date: e.target.value })}
                  className="px-2 py-1 text-xs border border-slate-300 rounded focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <textarea
                value={editData.notes}
                onChange={(e) => setEditData({ ...editData, notes: e.target.value })}
                className="w-full px-2 py-1 text-xs border border-slate-300 rounded focus:ring-1 focus:ring-blue-500"
                placeholder="Add context..."
                rows="2"
              />
            </div>
          ) : (
            <div>
              <div className={`text-sm font-medium flex items-center gap-2 ${
                shouldShowStrikethrough ? 'line-through text-slate-500' : 'text-slate-800'
              }`}>
                <span className="truncate">{task.title}</span>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                {task.due_date && (
                  <button
                    onClick={() => setShowDatePicker(!showDatePicker)}
                    className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium text-white ${dateBadgeColor} hover:opacity-80 transition-opacity`}
                  >
                    {dateBadgeText}
                  </button>
                )}
                {task.notes && (
                  <span className="text-xs text-slate-600 truncate">• {task.notes}</span>
                )}
              </div>
              {showDatePicker && (
                <div className="mt-1 flex items-center gap-2">
                  <input
                    type="date"
                    value={formatDateForInput(editData.due_date)}
                    onChange={(e) => handleDateChange(e.target.value)}
                    className="px-2 py-1 text-xs border border-slate-300 rounded focus:ring-1 focus:ring-blue-500"
                    autoFocus
                  />
                  <button
                    onClick={() => setShowDatePicker(false)}
                    className="text-xs text-slate-600 hover:text-slate-800"
                  >
                    Cancel
                  </button>
                </div>
              )}
              {showDelegateForm && (
                <div className="mt-1 flex items-center gap-2">
                  <input
                    type="text"
                    value={delegateInput}
                    onChange={(e) => setDelegateInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleDelegateSubmit()}
                    list="delegates-list"
                    className="flex-1 px-2 py-1 text-xs border border-slate-300 rounded focus:ring-1 focus:ring-blue-500"
                    placeholder="Name of person..."
                    autoFocus
                  />
                  <datalist id="delegates-list">
                    {delegates.map(d => <option key={d} value={d} />)}
                  </datalist>
                  <button
                    onClick={handleDelegateSubmit}
                    className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
                  >
                    ✓
                  </button>
                  <button
                    onClick={() => setShowDelegateForm(false)}
                    className="text-xs text-slate-600 hover:text-slate-800"
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
        {!isEditing && (
          <div className="flex-shrink-0 flex items-center gap-1">
            {task.project && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700">
                📁 {task.project}
              </span>
            )}
            {task.delegated_to && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700">
                👤 {task.delegated_to}
              </span>
            )}
          </div>
        )}
        <div className="flex-shrink-0 flex items-center gap-0.5">
          {!isEditing && (
            <button
              onClick={() => setShowDelegateForm(!showDelegateForm)}
              className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
              title="Delegate task"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </button>
          )}
          {isEditing ? (
            <>
              <button
                onClick={handleSave}
                className="p-1.5 text-green-600 hover:text-green-700 hover:bg-green-50 rounded transition-colors text-xs"
                title="Save"
              >
                ✓
              </button>
              <button
                onClick={handleCancel}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded transition-colors text-xs"
                title="Cancel"
              >
                ✕
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setIsEditing(true)}
                className="p-1.5 text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded transition-colors text-xs"
                title="Edit"
              >
                ✏️
              </button>
              <button
                onClick={() => onDelete(task.id)}
                className="p-1.5 text-red-600 hover:text-red-700 hover:bg-red-50 rounded transition-colors text-xs"
                title="Delete"
              >
                🗑️
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
