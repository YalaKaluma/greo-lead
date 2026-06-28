import React from 'react';
import axios from 'axios';
import { API_URL } from '../config';

const GoalReviewBanner = ({ status, userNumber, onSessionEnd }) => {
  const [isEnding, setIsEnding] = React.useState(false);

  if (!status || !status.active) {
    return null;
  }

  const handleEndSession = async () => {
    if (!confirm('Are you sure you want to end this goal review session? Your progress will be saved.')) {
      return;
    }

    setIsEnding(true);
    try {
      await axios.post(`${API_URL}/api/goal-review/end?user_number=${encodeURIComponent(userNumber)}`);
      if (onSessionEnd) {
        onSessionEnd();
      }
    } catch (error) {
      console.error('Failed to end session:', error);
      alert('Failed to end session. Please try again.');
    } finally {
      setIsEnding(false);
    }
  };

  // Progress dots: ●●●○○
  const progressDots = Array.from({ length: 5 }, (_, i) => (
    <span
      key={i}
      className={`inline-block w-2 h-2 rounded-full mx-0.5 ${
        i < status.phase_number ? 'bg-blue-500' : 'bg-gray-300'
      }`}
    />
  ));

  return (
    <div className="bg-blue-50 border-b border-blue-200 px-4 py-3 flex items-center justify-between shadow-sm">
      <div className="flex items-center space-x-3">
        <div className="flex-shrink-0">
          <span className="text-2xl">🎯</span>
        </div>
        <div>
          <div className="flex items-center space-x-2">
            <span className="text-sm font-semibold text-blue-900">
              Goal Review in Progress
            </span>
            <span className="text-xs text-blue-600">
              {status.phase_name}
            </span>
          </div>
          <div className="text-xs text-blue-700 mt-1">
            {status.goal_title}
          </div>
          <div className="flex items-center space-x-2 mt-1">
            <div className="flex">{progressDots}</div>
            <span className="text-xs text-blue-600">
              Phase {status.phase_number} of {status.total_phases}
            </span>
          </div>
        </div>
      </div>
      <button
        onClick={handleEndSession}
        disabled={isEnding}
        className="px-4 py-2 text-sm font-medium text-white bg-red-500 hover:bg-red-600 disabled:bg-red-300 rounded-md transition-colors duration-200 shadow-sm"
      >
        {isEnding ? 'Ending...' : 'End Session'}
      </button>
    </div>
  );
};

export default GoalReviewBanner;
