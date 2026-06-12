import React, { useState } from 'react';
import MessageFeedbackModal from './MessageFeedbackModal';
import useMessageFeedback from '../hooks/useMessageFeedback';

export default function MessageFeedbackButton({
  apiUrl = '',
  messageId,
  userNumber,
  sourceContext = 'journal',
  className = ''
}) {
  const [isOpen, setIsOpen] = useState(false);
  const { error, isSubmitting, savedFeedback, submitFeedback } = useMessageFeedback({
    apiUrl,
    messageId,
    userNumber,
    sourceContext
  });

  if (!messageId) return null;

  const handleSubmit = async (feedback) => {
    await submitFeedback(feedback);
    setIsOpen(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        title={savedFeedback ? 'Edit feedback' : 'Rate this message'}
        className={`inline-flex h-7 items-center justify-center rounded-full px-2 text-xs transition-colors ${className}`}
      >
        {savedFeedback ? '★ Saved' : 'Feedback'}
      </button>

      <MessageFeedbackModal
        isOpen={isOpen}
        initialFeedback={savedFeedback}
        isSubmitting={isSubmitting}
        error={error}
        onClose={() => setIsOpen(false)}
        onSubmit={handleSubmit}
      />
    </>
  );
}
