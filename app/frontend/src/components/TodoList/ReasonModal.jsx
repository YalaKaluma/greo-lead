// frontend/src/components/TodoList/ReasonModal.jsx
import { useState } from 'react';

/**
 * ReasonModal Component
 * 
 * Modal that appears when user rejects a task during priority review.
 * Collects optional feedback about why the task was rejected.
 */
export default function ReasonModal({ task, onSubmit, onClose }) {
  const [reason, setReason] = useState('');
  
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg p-6 max-w-md w-full shadow-2xl">
        <h3 className="text-xl font-semibold mb-2 text-gray-800">
          Why reject this task?
        </h3>
        <p className="text-sm font-medium text-gray-700 mb-3">
          {task.title}
        </p>
        <p className="text-sm text-gray-600 mb-4">
          Your feedback helps Alfred learn your priorities. This is optional but valuable for improving recommendations.
        </p>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="E.g., 'Not strategic right now', 'Need to focus on revenue first', 'Can delegate this'..."
          className="w-full p-3 border border-gray-300 rounded-lg mb-4 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          rows={4}
          autoFocus
        />
        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={() => onSubmit(reason.trim() || null)}
            className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium"
          >
            {reason.trim() ? 'Reject with Feedback' : 'Reject'}
          </button>
        </div>
      </div>
    </div>
  );
}
