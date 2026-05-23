import { useState } from 'react';
import axios from 'axios';

export default function useMessageFeedback({ apiUrl = '', messageId, sourceContext }) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [savedFeedback, setSavedFeedback] = useState(null);
  const [error, setError] = useState('');

  const submitFeedback = async ({ rating, feedbackText }) => {
    if (!messageId) return null;

    setIsSubmitting(true);
    setError('');

    try {
      const response = await axios.post(`${apiUrl}/api/message-feedback`, {
        message_id: messageId,
        source_context: sourceContext,
        rating,
        feedback_text: feedbackText
      });

      const saved = {
        id: response.data.feedback_id,
        rating: response.data.rating || rating,
        feedbackText
      };
      setSavedFeedback(saved);
      return saved;
    } catch (requestError) {
      console.error('Message feedback submission failed:', requestError);
      setError('Feedback could not be saved.');
      throw requestError;
    } finally {
      setIsSubmitting(false);
    }
  };

  return {
    error,
    isSubmitting,
    savedFeedback,
    submitFeedback
  };
}
