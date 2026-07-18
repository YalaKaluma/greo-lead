import { addDays, dateFromKey, formatDateKey } from './todoDateLogic.js';
import { getMtnLabel, normalizeDateString } from './taskHelpers.js';
import { getVisibleTaskScore, taskMatchesSearch, taskMatchesSelectedMtnTags } from './todoListLogic.js';

export const buildSevenDayWindow = (todayKey) => {
  const startDate = dateFromKey(todayKey) || new Date();
  return Array.from({ length: 7 }, (_, index) => {
    const date = addDays(startDate, index);
    const key = formatDateKey(date);
    return {
      key,
      date,
      label: index === 0 ? 'Today' : index === 1 ? 'Tomorrow' : date.toLocaleDateString('en-US', { weekday: 'short' }),
      dateLabel: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    };
  });
};

export const getCalendarMtnLabel = (task, getTaskScore = () => null) => {
  const scoreData = getVisibleTaskScore(task, getTaskScore);
  return scoreData ? getMtnLabel(scoreData.score) : '';
};

export const getTaskScheduledDate = (task) => (
  normalizeDateString(task?.scheduled_date || task?.due_date)
);

export const getExpectedMtnScore = (task, getTaskScore = () => null) => {
  const score = Number(getVisibleTaskScore(task, getTaskScore)?.score);
  if (!Number.isFinite(score)) return null;
  return Math.round(Math.max(0, Math.min(1, score)) * 100) / 10;
};

export const buildMtnCapacity = (trendChart = [], todayKey = '') => {
  const completedDays = trendChart
    .filter(item => item?.date && (!todayKey || item.date < todayKey))
    .slice(-21);
  if (completedDays.length === 0) return null;
  const total = completedDays.reduce((sum, item) => sum + Number(item.mtn_score || 0), 0);
  return Math.round((total / completedDays.length) * 10) / 10;
};

export const getMtnWorkloadStatus = (expectedMtn, capacity) => {
  if (!Number.isFinite(capacity) || capacity <= 0) return 'unknown';
  const ratio = expectedMtn / capacity;
  if (ratio < 0.6) return 'light';
  if (ratio <= 1) return 'balanced';
  if (ratio <= 1.25) return 'heavy';
  return 'overloaded';
};

export const summarizeCalendarDay = (tasks, capacity, getTaskScore = () => null) => {
  const activeTasks = tasks.filter(task => String(task.status || 'open').toLowerCase() !== 'completed');
  const scores = activeTasks
    .map(task => getExpectedMtnScore(task, getTaskScore))
    .filter(score => score !== null);
  const expectedMtn = Math.round(scores.reduce((sum, score) => sum + score, 0) * 10) / 10;
  return {
    taskCount: activeTasks.length,
    scoredTaskCount: scores.length,
    missingScoreCount: activeTasks.length - scores.length,
    expectedMtn,
    averageMtn: scores.length ? Math.round((expectedMtn / scores.length) * 10) / 10 : null,
    status: getMtnWorkloadStatus(expectedMtn, capacity),
  };
};

export const getCalendarTasks = ({
  tasks,
  todayKey,
  selectedMtnTags = [],
  searchQuery = '',
  getTaskScore = () => null,
}) => {
  const days = buildSevenDayWindow(todayKey);
  const dayKeys = new Set(days.map(day => day.key));
  const groupedTasks = Object.fromEntries(days.map(day => [day.key, []]));
  const allGroupedTasks = Object.fromEntries(days.map(day => [day.key, []]));
  const overdueTasks = [];

  tasks.forEach(task => {
    const status = String(task.status || 'open').toLowerCase();
    const dueKey = getTaskScheduledDate(task);

    if (status === 'completed' || !dueKey) return;
    if (dayKeys.has(dueKey)) allGroupedTasks[dueKey].push(task);
    if (!taskMatchesSelectedMtnTags(task, selectedMtnTags, getTaskScore)) return;
    if (!taskMatchesSearch(task, searchQuery)) return;

    if (dueKey < todayKey) {
      overdueTasks.push(task);
    } else if (dayKeys.has(dueKey)) {
      groupedTasks[dueKey].push(task);
    }
  });

  const sortByPriorityThenTitle = (a, b) => {
    const scoreA = getVisibleTaskScore(a, getTaskScore)?.score ?? -1;
    const scoreB = getVisibleTaskScore(b, getTaskScore)?.score ?? -1;
    if (scoreA !== scoreB) return scoreB - scoreA;
    return String(a.title || '').localeCompare(String(b.title || ''));
  };

  Object.keys(groupedTasks).forEach(key => groupedTasks[key].sort(sortByPriorityThenTitle));
  overdueTasks.sort(sortByPriorityThenTitle);

  return { days, groupedTasks, allGroupedTasks, overdueTasks };
};

export const replaceTaskDueDate = (currentDueDate, nextDateKey) => {
  const dueDate = String(currentDueDate || '');
  const timeIndex = dueDate.indexOf('T');
  if (timeIndex === -1) return nextDateKey;
  return `${nextDateKey}${dueDate.slice(timeIndex)}`;
};
