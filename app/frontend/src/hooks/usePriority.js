// frontend/src/hooks/usePriority.js
import { useState } from 'react';
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

  // Run prioritization only when requested by the user.
  const runPrioritization = async () => {
    setPriorityLoading(true);
    
    try {
      const res = await axios.post(`${apiUrl}/api/priority/run`, {
        user_number: userNumber
      });
      
      setPriorityRecommendation(res.data);
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
    priorityLoading,
    priorityRecommendation,
    
    // Actions
    runPrioritization,
    exitPriorityMode,
    getTaskScore
  };
}
