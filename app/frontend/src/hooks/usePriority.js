// frontend/src/hooks/usePriority.js
import { useEffect, useState } from 'react';
import axios from 'axios';

/**
 * Strategic Prioritization Hook
 * 
 * Manages the optional MTN lens:
 * - Running prioritization when the user asks for it
 * - Temporarily showing scored tasks in strategic order
 * - Returning to the user's manual organization
 */
export function usePriority(apiUrl, userNumber) {
  const [priorityMode, setPriorityMode] = useState(false);
  const [priorityLoading, setPriorityLoading] = useState(false);
  const [priorityRecommendation, setPriorityRecommendation] = useState(null);
  const [latestPriorityLoading, setLatestPriorityLoading] = useState(false);

  const loadLatestPrioritization = async () => {
    if (!apiUrl || !userNumber) return;

    setLatestPriorityLoading(true);
    try {
      const res = await axios.get(`${apiUrl}/api/priority/latest`, {
        params: { user_number: userNumber }
      });

      if (res.data?.has_prioritization) {
        setPriorityRecommendation({ ...res.data, source: 'stored_morning' });
        setPriorityMode(true);
      }
    } catch (err) {
      console.error('Failed to load stored MTN prioritization:', err);
    } finally {
      setLatestPriorityLoading(false);
    }
  };

  useEffect(() => {
    loadLatestPrioritization();
  }, [apiUrl, userNumber]);

  // Run prioritization only when requested by the user.
  const runPrioritization = async () => {
    setPriorityLoading(true);
    
    try {
      const res = await axios.post(`${apiUrl}/api/priority/run`, {
        user_number: userNumber
      });
      
      setPriorityRecommendation({ ...res.data, source: 'manual_run' });
      setPriorityMode(true);
      
      return { success: true };
    } catch (err) {
      console.error('Prioritization failed:', err);
      return { 
        success: false, 
        error: err.response?.data?.detail || 'Failed to generate recommendations' 
      };
    } finally {
      setPriorityLoading(false);
    }
  };

  // Exit the strategic lens without changing task organization.
  const exitPriorityMode = () => {
    setPriorityMode(false);
    setPriorityRecommendation(null);
  };

  const submitMtnFeedback = async (taskId, rating, feedback, tag, recommendationId = null) => {
    const activeRecommendationId = recommendationId || priorityRecommendation?.recommendation_id;
    if (!activeRecommendationId) {
      return { success: false, error: 'No MTN run found for this feedback' };
    }

    try {
      await axios.post(`${apiUrl}/api/priority/feedback`, {
        recommendation_id: activeRecommendationId,
        task_id: taskId,
        user_number: userNumber,
        rating,
        tag,
        feedback
      });

      return { success: true };
    } catch (err) {
      console.error('Failed to submit MTN feedback:', err);
      return {
        success: false,
        error: err.response?.data?.detail || 'Failed to save MTN feedback'
      };
    }
  };

  // Get task score data from recommendation
  const getTaskScore = (taskId) => {
    if (!priorityRecommendation) return null;
    return priorityRecommendation.all_scored_tasks?.find(
      st => st.task_id === taskId
    );
  };

  return {
    // State
    priorityMode,
    priorityLoading: priorityLoading || latestPriorityLoading,
    priorityRecommendation,
    
    // Actions
    runPrioritization,
    exitPriorityMode,
    submitMtnFeedback,
    getTaskScore,
    loadLatestPrioritization
  };
}
