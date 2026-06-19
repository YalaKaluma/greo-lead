import { addDays, dateFromKey, formatDateKey } from './todoDateLogic.js';
import { getMtnLabel, normalizeDateString } from './taskHelpers.js';
import { getVisibleTaskScore } from './todoListLogic.js';

export const CALENDAR_MTN_FILTERS = [
  { value: 'focus', label: 'Transformational + Strategic' },
  { value: 'all_mtn', label: 'All MTN tasks' },
  { value: 'transformational', label: 'Transformational only' },
  { value: 'strategic', label: 'Strategic only' },
  { value: 'operational', label: 'Operational' },
  { value: 'unclassified', label: 'Not classified' },
];

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

export const taskMatchesCalendarMtnFilter = (task, filterValue, getTaskScore = () => null) => {
  const label = getCalendarMtnLabel(task, getTaskScore);

  if (filterValue === 'focus') return label === 'Transformational' || label === 'Strategic';
  if (filterValue === 'all_mtn') return Boolean(label);
  if (filterValue === 'transformational') return label === 'Transformational';
  if (filterValue === 'strategic') return label === 'Strategic';
  if (filterValue === 'operational') return ['Important', 'Maintenance', 'Low Leverage'].includes(label);
  if (filterValue === 'unclassified') return !label;
  return true;
};

export const getCalendarTasks = ({
  tasks,
  todayKey,
  mtnFilter = 'focus',
  getTaskScore = () => null,
}) => {
  const days = buildSevenDayWindow(todayKey);
  const dayKeys = new Set(days.map(day => day.key));
  const groupedTasks = Object.fromEntries(days.map(day => [day.key, []]));
  const overdueTasks = [];

  tasks.forEach(task => {
    const status = String(task.status || 'open').toLowerCase();
    const dueKey = normalizeDateString(task.due_date);

    if (status === 'completed' || !dueKey) return;
    if (!taskMatchesCalendarMtnFilter(task, mtnFilter, getTaskScore)) return;

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

  return { days, groupedTasks, overdueTasks };
};

export const replaceTaskDueDate = (currentDueDate, nextDateKey) => {
  const dueDate = String(currentDueDate || '');
  const timeIndex = dueDate.indexOf('T');
  if (timeIndex === -1) return nextDateKey;
  return `${nextDateKey}${dueDate.slice(timeIndex)}`;
};
