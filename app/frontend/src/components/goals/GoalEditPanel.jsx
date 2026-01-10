import { useState, useEffect } from 'react';
import LinkedTasksSection from './LinkedTasksSection';

/* =========================================================
   MAIN COMPONENT
   ========================================================= */

export default function GoalEditPanel({ goal, goals, linkedTasks, onClose, onSave, onDelete }) {
  const [formData, setFormData] = useState({
    title: '',
    goal_text: '',
    why: '',
    time_horizon: 'short',
    parent_goal_id: null
  });

  // Initialize form data when goal prop changes
  useEffect(() => {
    if (goal) {
      setFormData({
        title: goal.title || '',
        goal_text: goal.goal_text || '',
        why: goal.why || '',
        time_horizon: goal.time_horizon || 'short',
        parent_goal_id: goal.parent_goal_id || null
      });
    }
  }, [goal]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value === '' ? null : value
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.title.trim()) {
      alert('Please enter a goal title');
      return;
    }
    onSave(goal.id, formData);
  };

  const handleDelete = () => {
    onDelete(goal.id);
  };

  // Filter available parent goals (exclude self and descendants)
  const availableParentGoals = goals.filter(g => 
    g.id !== goal.id && // Not self
    g.parent_goal_id !== goal.id // Not direct child (basic check)
  );

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex-shrink-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between rounded-t-xl">
          <h2 className="text-xl font-semibold text-slate-800">Edit Goal</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors p-1"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
        
        {/* Title */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Goal Title *
          </label>
          <input
            type="text"
            name="title"
            value={formData.title}
            onChange={handleChange}
            placeholder="Enter a clear, concise goal title"
            className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            autoFocus
          />
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Description
          </label>
          <textarea
            name="goal_text"
            value={formData.goal_text}
            onChange={handleChange}
            placeholder="Describe your goal in detail..."
            rows={4}
            className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
          />
        </div>

        {/* Why */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Why This Matters
          </label>
          <textarea
            name="why"
            value={formData.why}
            onChange={handleChange}
            placeholder="Why is this goal important to you?"
            rows={3}
            className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
          />
        </div>

        {/* Time Horizon */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Time Horizon
          </label>
          <div className="grid grid-cols-3 gap-3">
            <button
              type="button"
              onClick={() => setFormData(prev => ({ ...prev, time_horizon: 'long' }))}
              className={`px-4 py-3 rounded-lg border-2 transition-all ${
                formData.time_horizon === 'long'
                  ? 'border-purple-500 bg-purple-50 text-purple-700 font-medium'
                  : 'border-slate-200 hover:border-slate-300 text-slate-700'
              }`}
            >
              Long Term
            </button>
            <button
              type="button"
              onClick={() => setFormData(prev => ({ ...prev, time_horizon: 'medium' }))}
              className={`px-4 py-3 rounded-lg border-2 transition-all ${
                formData.time_horizon === 'medium'
                  ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium'
                  : 'border-slate-200 hover:border-slate-300 text-slate-700'
              }`}
            >
              Medium Term
            </button>
            <button
              type="button"
              onClick={() => setFormData(prev => ({ ...prev, time_horizon: 'short' }))}
              className={`px-4 py-3 rounded-lg border-2 transition-all ${
                formData.time_horizon === 'short'
                  ? 'border-green-500 bg-green-50 text-green-700 font-medium'
                  : 'border-slate-200 hover:border-slate-300 text-slate-700'
              }`}
            >
              Short Term
            </button>
          </div>
        </div>

        {/* Parent Goal */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Parent Goal (Optional)
          </label>
          <select
            name="parent_goal_id"
            value={formData.parent_goal_id || ''}
            onChange={handleChange}
            className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="">No Parent Goal</option>
            {availableParentGoals.map(g => (
              <option key={g.id} value={g.id}>
                {g.title || g.goal_text?.substring(0, 50) || 'Untitled Goal'}
              </option>
            ))}
          </select>
        </div>

        {/* Linked Tasks Display */}
        {linkedTasks.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-3">
              Linked Tasks ({linkedTasks.length})
            </label>
            <LinkedTasksSection tasks={linkedTasks} />
          </div>
        )}

      </form>

      {/* Footer with action buttons */}
      <div className="flex-shrink-0 bg-white border-t border-slate-200 px-6 py-4 space-y-3 rounded-b-xl">
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-3 border-2 border-slate-300 hover:border-slate-400 text-slate-700 rounded-lg font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
          >
            Save Changes
          </button>
        </div>
        
        <button
          onClick={handleDelete}
          className="w-full px-4 py-3 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg font-medium transition-colors border border-red-200"
        >
          Delete Goal
        </button>
      </div>
    </div>
  );
}
