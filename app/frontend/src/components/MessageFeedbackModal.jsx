import React, { useEffect, useState } from 'react';
import StarRating from './StarRating';

export default function MessageFeedbackModal({
  isOpen,
  initialFeedback = null,
  isSubmitting = false,
  error = '',
  onClose,
  onSubmit
}) {
  const [rating, setRating] = useState(initialFeedback?.rating || 0);
  const [feedbackText, setFeedbackText] = useState(initialFeedback?.feedbackText || '');

  useEffect(() => {
    if (isOpen) {
      setRating(initialFeedback?.rating || 0);
      setFeedbackText(initialFeedback?.feedbackText || '');
    }
  }, [initialFeedback, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!rating || isSubmitting) return;
    await onSubmit({ rating, feedbackText });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 px-4">
      <div className="w-full max-w-sm rounded-lg bg-white p-5 shadow-xl ring-1 ring-black/5">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Message feedback</h3>
            <p className="mt-1 text-xs text-gray-500">Rate how useful this response felt.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-2 py-1 text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            aria-label="Close feedback"
          >
            x
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <StarRating value={rating} onChange={setRating} disabled={isSubmitting} />

          <textarea
            value={feedbackText}
            onChange={(event) => setFeedbackText(event.target.value)}
            disabled={isSubmitting}
            rows={4}
            placeholder="Optional note"
            className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:bg-gray-50"
          />

          {error && <p className="text-xs text-red-600">{error}</p>}

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-lg px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!rating || isSubmitting}
              className="rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting ? 'Saving' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
