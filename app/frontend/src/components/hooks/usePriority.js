// frontend/src/hooks/usePriority.js
import { useState } from 'react';
import axios from 'axios';

/**
 * Priority Review Hook
 * 
 * Manages priority review state and API calls for:
 * - Running prioritization (LLM scoring)
 * - Recording user decisions (accept/reject)
 * - Applying approved changes to Top 10
 */
export function usePriority(apiUrl, userNumber) {
  const [priorityMode, setPriorityMode] = useState(false);
  const [priorityLoading, setPriorityLoading] = useState(false);
  const [priorityRecommendation, setPriorityRecommendation] = useState(null);
  const [priorityDecisions, setPriorityDecisions] = useState({});
  const [applyingPriority, setApplyingPriority] = useState(false);

  // Run prioritization - calls LLM to score all tasks
  const runPrioritization = async () => {
    setPriorityLoading(true);
    
    try {
      const res = await axios.post(`${apiUrl}/api/priority/run`, {
        user_number: userNumber
      });
      
      setPriorityRecommendation(res.data);
      setPriorityDecisions({});
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

  // Record user decision (accept/reject) for a task
  const recordDecision = async (taskId, action, reason = null) => {
    if (!priorityRecommendation) return { success: false };
    
    try {
      await axios.post(`${apiUrl}/api/priority/decision`, {
        recommendation_id: priorityRecommendation.recommendation_id,
        task_id: taskId,
        user_number: userNumber,
        user_action: action,
        user_reason: reason
      });
      
      // Update local state
      setPriorityDecisions(prev => ({
        ...prev,
        [taskId]: action
      }));
      
      return { success: true };
    } catch (err) {
      console.error('Failed to record decision:', err);
      return { success: false, error: 'Failed to record decision' };
    }
  };

  // Apply approved changes to Top 10
  const applyPriorityChanges = async () => {
    const acceptedTasks = Object.entries(priorityDecisions)
      .filter(([_, decision]) => decision === 'accept')
      .map(([taskId]) => parseInt(taskId));
    
    if (acceptedTasks.length === 0) {
      return { success: false, error: 'Please accept at least one task for your Top 10' };
    }
    
    setApplyingPriority(true);
    
    try {
      const res = await axios.post(`${apiUrl}/api/priority/apply`, {
        user_number: userNumber,
        approved_adds: acceptedTasks,
        approved_removes: []
      });
      
      // Exit priority mode
      setPriorityMode(false);
      setPriorityRecommendation(null);
      setPriorityDecisions({});
      
      return { 
        success: true, 
        message: `Success! Updated Top 10 with ${res.data.added} tasks.` 
      };
    } catch (err) {
      console.error('Failed to apply changes:', err);
      return { 
        success: false, 
        error: err.response?.data?.detail || 'Failed to update Top 10' 
      };
    } finally {
      setApplyingPriority(false);
    }
  };

  // Cancel priority mode without applying changes
  const cancelPriorityMode = () => {
    setPriorityMode(false);
    setPriorityRecommendation(null);
    setPriorityDecisions({});
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
    priorityDecisions,
    applyingPriority,
    
    // Actions
    runPrioritization,
    recordDecision,
    applyPriorityChanges,
    cancelPriorityMode,
    getTaskScore
  };
}
