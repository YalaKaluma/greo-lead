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

export const DEFAULT_TIMEZONE = 'America/New_York';

export const normalizeTimezone = (timezone) => {
  if (!timezone) return DEFAULT_TIMEZONE;

  try {
    Intl.DateTimeFormat('en-US', { timeZone: timezone });
  } catch {
    return DEFAULT_TIMEZONE;
  }

  return timezone;
};

export const getDateInTimezone = (timezone = DEFAULT_TIMEZONE) => {
  const now = new Date();
  return new Date(now.toLocaleString('en-US', { timeZone: normalizeTimezone(timezone) }));
};

export const getETDate = (timezone = DEFAULT_TIMEZONE) => getDateInTimezone(timezone);

export const formatDateForInput = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const normalizeDateString = (dateString) => {
  if (!dateString) return '';
  return dateString.split('T')[0];
};

export const dateStringToLocalDate = (dateString) => {
  const [year, month, day] = normalizeDateString(dateString).split('-').map(Number);
  return new Date(year, month - 1, day);
};

export const formatDateForDisplay = (dateString, options) => {
  if (!dateString) return '';
  return dateStringToLocalDate(dateString).toLocaleDateString('en-US', options);
};

export const getTodayET = (timezone = DEFAULT_TIMEZONE) => {
  const date = getDateInTimezone(timezone);
  return formatDateForInput(date);
};

export const isOverdueET = (dateString, timezone = DEFAULT_TIMEZONE) => {
  if (!dateString) return false;
  // Parse date string as YYYY-MM-DD and compare directly (no timezone conversion)
  const taskDateStr = normalizeDateString(dateString); // Get just the date part
  const todayStr = getTodayET(timezone);
  return taskDateStr < todayStr;
};

export const isTodayET = (dateString, timezone = DEFAULT_TIMEZONE) => {
  if (!dateString) return false;
  // Compare date strings directly (no timezone conversion)
  const taskDateStr = normalizeDateString(dateString); // Get just the date part
  const todayStr = getTodayET(timezone);
  return taskDateStr === todayStr;
};

// Helper function to get next Monday
export const getNextMonday = (timezone = DEFAULT_TIMEZONE) => {
  const date = getDateInTimezone(timezone);
  const day = date.getDay();
  const daysUntilMonday = day === 0 ? 1 : 8 - day; // If Sunday, 1 day. Otherwise, days until next Monday
  date.setDate(date.getDate() + daysUntilMonday);
  return formatDateForInput(date);
};

// ============================================================================
// GOAL HELPERS
// ============================================================================

// Helper function to sort goals hierarchically
export const getSortedGoals = (goals) => {
  const normalizeLevel = (value) => ({
    long: 'vision',
    long_term: 'vision',
    vision: 'vision',
    medium: 'pillar',
    medium_term: 'pillar',
    pillar: 'pillar',
    short: 'outcome',
    short_term: 'outcome',
    outcome: 'outcome'
  }[(value || '').toLowerCase()] || value);

  const longTerm = goals.filter(g => normalizeLevel(g.time_horizon) === 'vision');
  const mediumTerm = goals.filter(g => normalizeLevel(g.time_horizon) === 'pillar');
  const shortTerm = goals.filter(g => normalizeLevel(g.time_horizon) === 'outcome');
  
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

export const getLongTermGoals = (goals) => getSortedGoals(goals).filter(goal => {
  const h = goal.time_horizon?.toLowerCase();
  return h === 'long' || h === 'long_term' || h === 'vision';
});

// Helper function to get goal indentation
export const getGoalIndentation = (timeHorizon) => {
  const h = timeHorizon?.toLowerCase();
  if (h === 'long' || h === 'long_term' || h === 'vision') return '';
  if (h === 'medium' || h === 'medium_term' || h === 'pillar') return '\u00A0\u00A0\u00A0\u00A0';
  if (h === 'short' || h === 'short_term' || h === 'outcome') return '\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0';
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

export function formatDueDate(dateString, timezone = DEFAULT_TIMEZONE) {
  if (!dateString) return '';
  
  // Parse date parts directly from string to avoid timezone issues
  const taskDateStr = normalizeDateString(dateString); // YYYY-MM-DD
  const todayStr = getTodayET(timezone); // YYYY-MM-DD
  
  // Calculate difference in days using string parsing
  const todayParts = todayStr.split('-').map(Number);
  
  const taskDate = dateStringToLocalDate(taskDateStr);
  const todayDate = new Date(todayParts[0], todayParts[1] - 1, todayParts[2]);
  
  const diffTime = taskDate - todayDate;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays < 0) return `Overdue ${Math.abs(diffDays)}d`;
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays <= 7) return `In ${diffDays}d`;
  
  return taskDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function getDueDateColor(dateString, timezone = DEFAULT_TIMEZONE) {
  if (!dateString) return 'bg-gray-100 text-gray-700';
  
  if (isOverdueET(dateString, timezone)) {
    return 'bg-red-100 text-red-700 font-semibold';
  }
  if (isTodayET(dateString, timezone)) {
    return 'bg-orange-100 text-orange-700 font-semibold';
  }
  
  // Parse date parts directly from string to avoid timezone issues
  const taskDateStr = normalizeDateString(dateString);
  const todayStr = getTodayET(timezone);
  
  const todayParts = todayStr.split('-').map(Number);
  
  const taskDate = dateStringToLocalDate(taskDateStr);
  const todayDate = new Date(todayParts[0], todayParts[1] - 1, todayParts[2]);
  
  const diffTime = taskDate - todayDate;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays <= 3) {
    return 'bg-amber-100 text-amber-700';
  }
  
  return 'bg-green-100 text-green-700';
}

// ============================================================================
// MTN HELPERS
// ============================================================================

export const MTN_TAG_OPTIONS = [
  'Transformational',
  'Strategic',
  'Important',
  'Maintenance',
  'Low Leverage'
];

export const getMtnLabel = (score) => {
  const numericScore = Number(score);
  if (Number.isNaN(numericScore)) return '';
  if (numericScore >= 0.85) return 'Transformational';
  if (numericScore >= 0.7) return 'Strategic';
  if (numericScore >= 0.5) return 'Important';
  if (numericScore >= 0.3) return 'Maintenance';
  return 'Low Leverage';
};

export const getMtnStyle = (score) => {
  const label = getMtnLabel(score);
  if (label === 'Transformational') return 'bg-blue-100 text-blue-800 border-blue-200';
  if (label === 'Strategic') return 'bg-emerald-100 text-emerald-800 border-emerald-200';
  if (label === 'Important') return 'bg-amber-100 text-amber-800 border-amber-200';
  if (label === 'Maintenance') return 'bg-slate-100 text-slate-700 border-slate-200';
  return 'bg-gray-100 text-gray-600 border-gray-200';
};
