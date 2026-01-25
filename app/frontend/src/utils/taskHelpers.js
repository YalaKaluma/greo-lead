// frontend/src/utils/taskHelpers.js
/**
 * Task Helper Functions
 * 
 * All utility functions for task management:
 * - Eastern Time date handling
 * - Date formatting and comparisons
 * - Priority icons and colors
 * - Goal sorting and indentation
 */

// ============================================================================
// EASTERN TIME HELPERS
// ============================================================================

export const getETDate = () => {
  const now = new Date();
  // Convert to ET (UTC-5)
  const etDate = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  return etDate;
};

export const getTodayET = () => {
  const etDate = getETDate();
  return etDate.toISOString().split('T')[0];
};

export const isOverdueET = (dateString) => {
  if (!dateString) return false;
  // Parse date string as YYYY-MM-DD and compare directly (no timezone conversion)
  const taskDateStr = dateString.split('T')[0]; // Get just the date part
  const todayStr = getTodayET();
  return taskDateStr < todayStr;
};

export const isTodayET = (dateString) => {
  if (!dateString) return false;
  // Compare date strings directly (no timezone conversion)
  const taskDateStr = dateString.split('T')[0]; // Get just the date part
  const todayStr = getTodayET();
  return taskDateStr === todayStr;
};

// Helper function to get next Monday
export const getNextMonday = () => {
  const date = getETDate();  // Use ET instead of new Date()
  const day = date.getDay();
  const daysUntilMonday = day === 0 ? 1 : 8 - day; // If Sunday, 1 day. Otherwise, days until next Monday
  date.setDate(date.getDate() + daysUntilMonday);
  return date.toISOString().split('T')[0];
};

// ============================================================================
// GOAL HELPERS
// ============================================================================

// Helper function to sort goals hierarchically
export const getSortedGoals = (goals) => {
  const longTerm = goals.filter(g => g.time_horizon === 'long');
  const mediumTerm = goals.filter(g => g.time_horizon === 'medium');
  const shortTerm = goals.filter(g => g.time_horizon === 'short');
  
  const result = [];
  
  longTerm.forEach(ltGoal => {
    result.push(ltGoal);
    
    const relatedMedium = mediumTerm.filter(mt => mt.parent_goal_id === ltGoal.id);
    relatedMedium.forEach(mtGoal => {
      result.push(mtGoal);
      
      const relatedShort = shortTerm.filter(st => st.parent_goal_id === mtGoal.id);
      relatedShort.forEach(stGoal => {
        result.push(stGoal);
      });
    });
  });
  
  mediumTerm.forEach(mt => {
    if (!result.includes(mt)) result.push(mt);
  });
  shortTerm.forEach(st => {
    if (!result.includes(st)) result.push(st);
  });
  
  return result;
};

// Helper function to get goal indentation
export const getGoalIndentation = (timeHorizon) => {
  const h = timeHorizon?.toLowerCase();
  if (h === 'long') return '';
  if (h === 'medium') return '\u00A0\u00A0\u00A0\u00A0';
  if (h === 'short') return '\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0';
  return '';
};

// ============================================================================
// PRIORITY HELPERS
// ============================================================================

export function getPriorityIcon(priority) {
  const p = priority?.toLowerCase();
  if (p === 'high') return '🔴';
  if (p === 'medium') return '🟠';
  if (p === 'low') return '🟢';
  return '🟢';
}

// ============================================================================
// DATE FORMATTING
// ============================================================================

export function formatDueDate(dateString) {
  if (!dateString) return '';
  
  // Parse date parts directly from string to avoid timezone issues
  const taskDateStr = dateString.split('T')[0]; // YYYY-MM-DD
  const todayStr = getTodayET(); // YYYY-MM-DD
  
  // Calculate difference in days using string parsing
  const taskParts = taskDateStr.split('-').map(Number);
  const todayParts = todayStr.split('-').map(Number);
  
  const taskDate = new Date(taskParts[0], taskParts[1] - 1, taskParts[2]);
  const todayDate = new Date(todayParts[0], todayParts[1] - 1, todayParts[2]);
  
  const diffTime = taskDate - todayDate;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays < 0) return `Overdue ${Math.abs(diffDays)}d`;
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays <= 7) return `In ${diffDays}d`;
  
  return taskDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function getDueDateColor(dateString) {
  if (!dateString) return 'bg-gray-100 text-gray-700';
  
  if (isOverdueET(dateString)) {
    return 'bg-red-100 text-red-700 font-semibold';
  }
  if (isTodayET(dateString)) {
    return 'bg-orange-100 text-orange-700 font-semibold';
  }
  
  // Parse date parts directly from string to avoid timezone issues
  const taskDateStr = dateString.split('T')[0];
  const todayStr = getTodayET();
  
  const taskParts = taskDateStr.split('-').map(Number);
  const todayParts = todayStr.split('-').map(Number);
  
  const taskDate = new Date(taskParts[0], taskParts[1] - 1, taskParts[2]);
  const todayDate = new Date(todayParts[0], todayParts[1] - 1, todayParts[2]);
  
  const diffTime = taskDate - todayDate;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays <= 3) {
    return 'bg-amber-100 text-amber-700';
  }
  
  return 'bg-green-100 text-green-700';
}
