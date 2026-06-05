import { useState, useEffect } from 'react';
import { getGoalLevelLabel, normalizeGoalLevel } from '../../utils/goalTaxonomy';

/* =========================================================
   MAIN COMPONENT
   ========================================================= */

export default function GoalCreateModal({ goals, values = [], initialGoalLevel = 'vision', parentGoalId = null, onClose, onCreate }) {
  const [formData, setFormData] = useState({
    title: '',
    goal_text: '',
    why: '',
    time_horizon: initialGoalLevel,
    parent_goal_id: parentGoalId,
    value_ids: []
  });

  useEffect(() => {
    setFormData(prev => ({
      ...prev,
      time_horizon: initialGoalLevel,
      parent_goal_id: parentGoalId
    }));
  }, [initialGoalLevel, parentGoalId]);

  // Auto-suggest structural level based on parent
  useEffect(() => {
    if (parentGoalId) {
      const parentGoal = goals.find(g => g.id === parentGoalId);
      if (parentGoal) {
        // Child goals should move one structural level down from parent
        const parentLevel = normalizeGoalLevel(parentGoal.time_horizon);
        const childHorizon = 
          parentLevel === 'vision' ? 'pillar' :
          parentLevel === 'pillar' ? 'outcome' : 'outcome';
        
        setFormData(prev => ({
          ...prev,
          time_horizon: childHorizon,
          parent_goal_id: parentGoalId
        }));
      }
    }
  }, [parentGoalId, goals]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value === '' ? null : value
    }));
  };

  const toggleValue = (valueId) => {
    setFormData(prev => {
      const currentIds = prev.value_ids || [];
      const nextIds = currentIds.includes(valueId)
        ? currentIds.filter(id => id !== valueId)
        : [...currentIds, valueId];
      return { ...prev, value_ids: nextIds };
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.title.trim()) {
      alert(`Please enter a ${getGoalLevelLabel(formData.time_horizon).toLowerCase()} title`);
      return;
    }
    if (selectedLevel !== 'vision' && !formData.parent_goal_id) {
      alert(`Please select a parent ${selectedLevel === 'pillar' ? 'vision' : 'pillar'}`);
      return;
    }
    onCreate({
      ...formData,
      value_ids: selectedLevel === 'vision' ? formData.value_ids : []
    });
  };

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const parentGoal = parentGoalId ? goals.find(g => g.id === parentGoalId) : null;
  const selectedLevel = normalizeGoalLevel(formData.time_horizon);
  const parentOptions = goals.filter(goal => {
    const level = normalizeGoalLevel(goal.time_horizon);
    if (selectedLevel === 'vision') return false;
    if (selectedLevel === 'pillar') return level === 'vision';
    if (selectedLevel === 'outcome') return level === 'pillar';
    return false;
  });

  return (
    <div 
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={handleBackdropClick}
    >
      <div 
        className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-slate-800">
            Create {getGoalLevelLabel(formData.time_horizon)}
          </h2>
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
        <form onSubmit={handleSubmit} className="p-6 space-y-6 overflow-y-auto max-h-[calc(90vh-140px)]">
          
          {/* Parent indicator */}
          {parentGoal && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-900">
                <span className="font-medium">Creating under:</span>
                <br />
                <span className="text-lg">{parentGoal.title || parentGoal.goal_text?.substring(0, 60)}</span>
              </p>
            </div>
          )}

          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              {getGoalLevelLabel(formData.time_horizon)} Title *
            </label>
            <input
              type="text"
              name="title"
              value={formData.title}
              onChange={handleChange}
              placeholder={`Enter a clear, concise ${getGoalLevelLabel(formData.time_horizon).toLowerCase()} title`}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-base"
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
              placeholder={`Describe this ${getGoalLevelLabel(formData.time_horizon).toLowerCase()} in detail...`}
              rows={4}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none text-base"
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
              placeholder={`Why is this ${getGoalLevelLabel(formData.time_horizon).toLowerCase()} important to you?`}
              rows={3}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none text-base"
            />
          </div>

          {/* Structural level */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Type
            </label>
            <div className="grid grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => setFormData(prev => ({ ...prev, time_horizon: 'vision', parent_goal_id: null }))}
                className={`px-4 py-3 rounded-lg border-2 transition-all ${
                  normalizeGoalLevel(formData.time_horizon) === 'vision'
                    ? 'border-purple-500 bg-purple-50 text-purple-700 font-medium'
                    : 'border-slate-200 hover:border-slate-300 text-slate-700'
                }`}
              >
                Vision
              </button>
              <button
                type="button"
                onClick={() => setFormData(prev => ({ ...prev, time_horizon: 'pillar', parent_goal_id: null }))}
                className={`px-4 py-3 rounded-lg border-2 transition-all ${
                  normalizeGoalLevel(formData.time_horizon) === 'pillar'
                    ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium'
                    : 'border-slate-200 hover:border-slate-300 text-slate-700'
                }`}
              >
                Pillar
              </button>
              <button
                type="button"
                onClick={() => setFormData(prev => ({ ...prev, time_horizon: 'outcome', parent_goal_id: null }))}
                className={`px-4 py-3 rounded-lg border-2 transition-all ${
                  normalizeGoalLevel(formData.time_horizon) === 'outcome'
                    ? 'border-green-500 bg-green-50 text-green-700 font-medium'
                    : 'border-slate-200 hover:border-slate-300 text-slate-700'
                }`}
              >
                Outcome
              </button>
            </div>
          </div>

          {selectedLevel === 'vision' && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Associated Values
              </label>
              {values.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {values.map(value => {
                    const selected = (formData.value_ids || []).includes(value.id);
                    return (
                      <button
                        key={value.id}
                        type="button"
                        onClick={() => toggleValue(value.id)}
                        className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                          selected
                            ? 'border-blue-500 bg-blue-50 text-blue-700'
                            : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                        }`}
                      >
                        {value.title || value.value_text}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-slate-500">Add values in My Leadership Journey before linking them to a vision.</p>
              )}
            </div>
          )}

          {/* Parent selector */}
          {selectedLevel !== 'vision' && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Parent {selectedLevel === 'pillar' ? 'Vision' : 'Pillar'} *
              </label>
              <select
                name="parent_goal_id"
                value={formData.parent_goal_id || ''}
                onChange={handleChange}
                disabled={!!parentGoalId}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-slate-100 disabled:cursor-not-allowed text-base"
              >
                <option value="">Select parent...</option>
                {parentOptions.map(g => (
                  <option key={g.id} value={g.id}>
                    {getGoalLevelLabel(g.time_horizon)}: {g.title || g.goal_text?.substring(0, 50) || 'Untitled'}
                  </option>
                ))}
              </select>
            </div>
          )}

        </form>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 flex gap-3">
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
            Create {getGoalLevelLabel(formData.time_horizon)}
          </button>
        </div>
      </div>
    </div>
  );
}
