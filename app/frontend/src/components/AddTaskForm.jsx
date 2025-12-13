import React, { useState } from 'react';

export default function AddTaskForm({ onSubmit, projects, delegates }) {
  const [formData, setFormData] = useState({
    title: '',
    notes: '',
    due_date: '',
    priority: 'Medium',
    project: '',
    delegated_to: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.title.trim()) {
      alert('Please enter a task title');
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit(formData);
      setFormData({
        title: '',
        notes: '',
        due_date: '',
        priority: 'Medium',
        project: '',
        delegated_to: '',
      });
    } catch (error) {
      console.error('Error submitting task:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <div className="grid grid-cols-12 gap-2">
        <div className="col-span-6">
          <input
            type="text"
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-transparent"
            placeholder="Task title *"
            required
          />
        </div>
        <div className="col-span-3">
          <input
            type="text"
            value={formData.project}
            onChange={(e) => setFormData({ ...formData, project: e.target.value })}
            list="projects-list-add"
            className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-transparent"
            placeholder="Project"
          />
          <datalist id="projects-list-add">
            {projects.map(p => <option key={p} value={p} />)}
          </datalist>
        </div>
        <div className="col-span-3">
          <input
            type="text"
            value={formData.delegated_to}
            onChange={(e) => setFormData({ ...formData, delegated_to: e.target.value })}
            list="delegates-list-add"
            className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-transparent"
            placeholder="Delegate to"
          />
          <datalist id="delegates-list-add">
            {delegates.map(d => <option key={d} value={d} />)}
          </datalist>
        </div>
      </div>
      <div className="grid grid-cols-12 gap-2">
        <div className="col-span-2">
          <input
            type="date"
            value={formData.due_date}
            onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
            className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <div className="col-span-2">
          <select
            value={formData.priority}
            onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
            className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="High">🔴 High</option>
            <option value="Medium">🟠 Medium</option>
            <option value="Low">🟢 Low</option>
          </select>
        </div>
        <div className="col-span-6">
          <input
            type="text"
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-transparent"
            placeholder="Context (optional)"
          />
        </div>
        <div className="col-span-2">
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded transition-colors disabled:bg-blue-400 disabled:cursor-not-allowed"
          >
            {isSubmitting ? '...' : '+ Add'}
          </button>
        </div>
      </div>
    </form>
  );
}
