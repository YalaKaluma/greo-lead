// frontend/src/components/PriorityReview.jsx
/**
 * Priority Review Component
 * 
 * Allows users to review and accept/reject task prioritization recommendations.
 * 
 * Flow:
 * 1. User clicks "Review My Tasks"
 * 2. System runs prioritization (LLM scoring)
 * 3. Shows recommended changes (add/remove/keep)
 * 4. User accepts/rejects each recommendation
 * 5. User applies approved changes
 * 6. Top 10 is updated
 */

import React, { useState, useEffect } from 'react';
import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_BASE || '';

export default function PriorityReview({ userNumber, onComplete }) {
  const [loading, setLoading] = useState(false);
  const [recommendation, setRecommendation] = useState(null);
  const [decisions, setDecisions] = useState({});
  const [showReasonModal, setShowReasonModal] = useState(null);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState(null);
  
  const runPrioritization = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const res = await axios.post(`${API_BASE}/api/priority/run`, {
        user_number: userNumber
      });
      
      setRecommendation(res.data);
      setDecisions({}); // Reset decisions
      
    } catch (err) {
      console.error('Prioritization failed:', err);
      setError(err.response?.data?.detail || 'Failed to generate recommendations');
    } finally {
      setLoading(false);
    }
  };
  
  const handleDecision = async (taskId, action, reason = null) => {
    try {
      await axios.post(`${API_BASE}/api/priority/decision`, {
        recommendation_id: recommendation.recommendation_id,
        task_id: taskId,
        user_number: userNumber,
        user_action: action,
        user_reason: reason
      });
      
      // Update local state
      setDecisions(prev => ({
        ...prev,
        [taskId]: action
      }));
      
      setShowReasonModal(null);
      
    } catch (err) {
      console.error('Failed to record decision:', err);
      alert('Failed to record decision. Please try again.');
    }
  };
  
  const applyApprovedChanges = async () => {
    console.log('applyApprovedChanges called');
    console.log('Current decisions:', decisions);
    
    // Get all tasks that user accepted
    const acceptedTasks = Object.entries(decisions)
      .filter(([taskId, decision]) => decision === 'accept')
      .map(([taskId]) => parseInt(taskId));
    
    console.log('Accepted tasks:', acceptedTasks);
    
    if (acceptedTasks.length === 0) {
      alert('Please accept at least one task for your Top 10');
      return;
    }
    
    setApplying(true);
    
    try {
      console.log('Sending request to /api/priority/apply');
      const res = await axios.post(`${API_BASE}/api/priority/apply`, {
        user_number: userNumber,
        approved_adds: acceptedTasks,
        approved_removes: [] // We'll let the system figure out what to remove
      });
      
      console.log('Apply response:', res.data);
      alert(`Success! Updated Top 10 with ${res.data.added} tasks.`);
      
      // Call completion callback
      if (onComplete) {
        onComplete();
      }
      
      // Reset state
      setRecommendation(null);
      setDecisions({});
      
    } catch (err) {
      console.error('Failed to apply changes:', err);
      console.error('Error details:', err.response?.data);
      alert(`Failed to update Top 10: ${err.response?.data?.detail || err.message}`);
    } finally {
      setApplying(false);
    }
  };
  
  // Initial empty state
  if (!recommendation) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <div className="text-center">
            <h2 className="text-3xl font-semibold mb-4 text-gray-800">
              Task Prioritization
            </h2>
            <p className="text-gray-600 mb-6 text-lg">
              Alfred will review your tasks and recommend which ones belong in your Top 10 focus list.
            </p>
            
            {error && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-red-800">{error}</p>
              </div>
            )}
            
            <button
              onClick={runPrioritization}
              disabled={loading}
              className="px-8 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-lg font-medium transition-colors"
            >
              {loading ? (
                <span className="flex items-center justify-center">
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Analyzing Tasks...
                </span>
              ) : 'Review My Tasks'}
            </button>
            
            <p className="text-sm text-gray-500 mt-4">
              This takes about 10-15 seconds
            </p>
          </div>
        </div>
      </div>
    );
  }
  
  const changes = recommendation.recommended_changes;
  const hasChanges = changes.add.length > 0 || changes.remove.length > 0;
  
  // Get all scored tasks sorted by score
  const allTasks = recommendation.all_scored_tasks || [];
  
  // Debug logging
  console.log('Recommendation data:', recommendation);
  console.log('All tasks:', allTasks);
  console.log('Changes:', changes);
  
  // Fallback if all_scored_tasks is not available
  if (allTasks.length === 0) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <div className="text-center">
            <div className="text-6xl mb-4">⚠️</div>
            <h3 className="text-2xl font-semibold text-gray-800 mb-2">
              No Tasks to Review
            </h3>
            <p className="text-gray-600 mb-6">
              No tasks due today or overdue. Check back later!
            </p>
            <button
              onClick={() => setRecommendation(null)}
              className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }
  
  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-lg p-6">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-semibold text-gray-800">
              Prioritization Results
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              {recommendation.message}
            </p>
          </div>
          <div className="text-sm text-gray-500">
            Used {recommendation.tokens_used} tokens
          </div>
        </div>
      </div>
      
      {/* All Scored Tasks */}
      <div className="bg-white rounded-lg shadow-lg p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">
          All Tasks Due Today (Scored)
        </h3>
        <p className="text-sm text-gray-600 mb-4">
          Review scores for all tasks due today or overdue. Accept tasks for your Top 10 focus list.
        </p>
        
        <div className="space-y-3">
          {allTasks.map((task) => {
            try {
              const isInTop10 = task.in_current_top10 || false;
              const action = changes.add?.includes(task.task_id) ? 'add' : 
                            changes.remove?.includes(task.task_id) ? 'remove' : 
                            'keep';
              
              return (
                <TaskRecommendation
                  key={task.task_id}
                  task={task}
                  action={action}
                  decision={decisions[task.task_id]}
                  onAccept={() => handleDecision(task.task_id, 'accept')}
                  onReject={() => setShowReasonModal(task)}
                  onWhy={() => alert(`Alfred's Reasoning:\n\n${task.reason}\n\n${task.risk_if_ignored ? 'Risk if ignored: ' + task.risk_if_ignored : ''}`)}
                  isInTop10={isInTop10}
                />
              );
            } catch (err) {
              console.error('Error rendering task:', task, err);
              return null;
            }
          })}
        </div>
      </div>
      
      {/* Apply Changes Button */}
      <div className="bg-white rounded-lg shadow-lg p-6">
        <div className="flex justify-between items-center">
          <div>
            <p className="text-sm text-gray-600">
              Review all tasks above and accept those you want in your Top 10
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => setRecommendation(null)}
              className="px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 font-medium"
            >
              Cancel
            </button>
            <button
              onClick={applyApprovedChanges}
              disabled={applying || Object.keys(decisions).length === 0}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              title={Object.keys(decisions).length === 0 ? "Accept at least one task first" : ""}
            >
              {applying ? 'Applying...' : `Apply ${Object.values(decisions).filter(d => d === 'accept').length} Changes`}
            </button>
          </div>
        </div>
        
        {/* Show message if no decisions made */}
        {Object.keys(decisions).length === 0 && (
          <div className="mt-2 text-sm text-amber-600">
            💡 Click "✓ Accept" or "✗ Reject" on tasks above to enable the Apply button
          </div>
        )}
      </div>
      
      {/* Reason Modal */}
      {showReasonModal && (
        <ReasonModal
          task={showReasonModal}
          onSubmit={(reason) => handleDecision(showReasonModal.task_id, 'reject', reason)}
          onClose={() => setShowReasonModal(null)}
        />
      )}
    </div>
  );
}

function TaskRecommendation({ task, action, decision, onAccept, onReject, onWhy, isInTop10 }) {
  const actionIcons = {
    add: '➕',
    remove: '➖',
    keep: '✓'
  };
  
  const actionColors = {
    add: 'green',
    remove: 'orange',
    keep: 'blue'
  };
  
  const actionLabels = {
    add: 'Recommended for Top 10',
    remove: 'Remove from Top 10',
    keep: 'Already in Top 10'
  };
  
  const actionColor = actionColors[action];
  const actionIcon = actionIcons[action];
  const actionLabel = actionLabels[action];
  
  // Get confidence badge color
  const confidenceColors = {
    high: 'bg-green-100 text-green-800',
    medium: 'bg-yellow-100 text-yellow-800',
    low: 'bg-gray-100 text-gray-800'
  };
  
  return (
    <div className={`p-4 border-2 rounded-lg transition-all ${
      decision === 'accept' ? 'bg-green-50 border-green-300' :
      decision === 'reject' ? 'bg-red-50 border-red-300' :
      'bg-white border-gray-200 hover:border-gray-300'
    }`}>
      <div className="flex justify-between items-start mb-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg">{actionIcon}</span>
            <p className="font-semibold text-gray-800">
              {task.title || `Task #${task.task_id}`}
            </p>
            <span className={`text-xs px-2 py-1 rounded bg-${actionColor}-100 text-${actionColor}-800`}>
              {actionLabel}
            </span>
          </div>
          {task.notes && (
            <p className="text-xs text-gray-500 mb-2 italic">
              {task.notes}
            </p>
          )}
          <p className="text-gray-700 mb-2">
            {task.reason}
          </p>
          <div className="flex gap-2 items-center">
            <span className={`px-2 py-1 text-xs rounded font-medium ${confidenceColors[task.confidence] || confidenceColors.medium}`}>
              {task.confidence} confidence
            </span>
            <span className="px-2 py-1 text-xs rounded bg-blue-100 text-blue-800 font-medium">
              Score: {(task.score * 100).toFixed(0)}%
            </span>
          </div>
        </div>
      </div>
      
      {!decision && (
        <div className="flex gap-2 mt-3">
          <button
            onClick={onAccept}
            className="flex-1 px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium transition-colors"
          >
            ✓ Accept
          </button>
          <button
            onClick={onReject}
            className="flex-1 px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium transition-colors"
          >
            ✗ Reject
          </button>
          <button
            onClick={onWhy}
            className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 font-medium transition-colors"
            title="Show Alfred's reasoning"
          >
            💡 Why?
          </button>
        </div>
      )}
      
      {decision && (
        <div className={`mt-3 text-sm font-semibold ${
          decision === 'accept' ? 'text-green-700' : 'text-red-700'
        }`}>
          {decision === 'accept' ? '✓ Accepted' : '✗ Rejected'}
        </div>
      )}
    </div>
  );
}

function ReasonModal({ task, onSubmit, onClose }) {
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
