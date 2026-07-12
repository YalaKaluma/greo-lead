import { getMtnLabel } from './taskHelpers.js';

export const getStoredTaskScore = (task) => {
  const rawScore = task.mtn_score_today ?? task.move_the_needle_score;
  if (rawScore === null || rawScore === undefined) return null;
  const numericScore = Number(rawScore);
  if (Number.isNaN(numericScore)) return null;

  return {
    task_id: task.id,
    title: task.title,
    score: numericScore > 1 ? numericScore / 10 : numericScore,
    reason: task.mtn_reason_today || task.strategic_intent || 'Alfred prioritized this from your todo list.',
    risk_if_ignored: task.mtn_risk_today || null,
    confidence: 'medium',
    rank: task.mtn_rank_today ?? task.top10_position ?? null,
    is_top_mtn: Boolean(task.mtn_recommended_today),
    recommendation_id: task.mtn_recommendation_id || null
  };
};

export const getVisibleTaskScore = (task, getTaskScore = () => null) => {
  return getTaskScore(task.id) || getStoredTaskScore(task);
};

export const taskMatchesSelectedMtnTags = (task, selectedMtnTags, getTaskScore = () => null) => {
  if (selectedMtnTags.length === 0) return true;
  const scoreData = getVisibleTaskScore(task, getTaskScore);
  if (!scoreData) return false;
  return selectedMtnTags.includes(getMtnLabel(scoreData.score));
};

export const taskMatchesSearch = (task, searchQuery) => {
  const query = searchQuery.trim().toLowerCase();
  if (!query) return true;

  const searchableText = [
    task.title,
    task.description,
    task.project,
    task.delegated_to,
    task.goal_title,
    task.strategic_intent,
    task.mtn_reason_today,
    task.mtn_risk_today,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return searchableText.includes(query);
};

export const getVisibleTasks = ({
  tasks,
  selectedMtnTags = [],
  searchQuery = '',
  getTaskScore = () => null,
}) => {
  return tasks.filter(task =>
    taskMatchesSelectedMtnTags(task, selectedMtnTags, getTaskScore) &&
    taskMatchesSearch(task, searchQuery)
  );
};

export const hasStoredMtnScoring = (tasks, getTaskScore = () => null) => {
  return tasks.some(task => Boolean(getVisibleTaskScore(task, getTaskScore)));
};

export const prioritySortValue = (priority) => {
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  return priorityOrder[String(priority || '').toLowerCase()] ?? 3;
};

export const mtnSortValue = (task, getTaskScore = () => null) => {
  const scoreData = getVisibleTaskScore(task, getTaskScore);
  if (!scoreData) return 999;
  const labelOrder = {
    '1. Transformation': 0,
    '2. Strategic': 1,
    '3. Important': 2,
    '4. Maintenance': 3,
    '5. Low Leverage': 4
  };
  return labelOrder[getMtnLabel(scoreData.score)] ?? 999;
};

export const compareTasksByColumn = (a, b, columnSort, getTaskScore = () => null) => {
  if (!columnSort) return 0;

  const direction = columnSort.direction === 'asc' ? -1 : 1;
  const valueA = columnSort.key === 'urgency' ? prioritySortValue(a.priority) : mtnSortValue(a, getTaskScore);
  const valueB = columnSort.key === 'urgency' ? prioritySortValue(b.priority) : mtnSortValue(b, getTaskScore);
  if (valueA !== valueB) return (valueA - valueB) * direction;

  const titleCompare = String(a.title || '').localeCompare(String(b.title || ''));
  if (titleCompare !== 0) return titleCompare;
  return (a.id ?? 0) - (b.id ?? 0);
};

export const getSortedTasks = ({
  tasks,
  selectedMtnTags = [],
  searchQuery = '',
  sortOrder = [],
  columnSort = null,
  getTaskScore = () => null,
  priorityMode = false,
}) => {
  const visibleTasks = getVisibleTasks({ tasks, selectedMtnTags, searchQuery, getTaskScore });

  if (columnSort) {
    return [...visibleTasks].sort((a, b) => compareTasksByColumn(a, b, columnSort, getTaskScore));
  }

  if (priorityMode && hasStoredMtnScoring(visibleTasks, getTaskScore)) {
    return [...visibleTasks].sort((a, b) => {
      const scoreA = getVisibleTaskScore(a, getTaskScore);
      const scoreB = getVisibleTaskScore(b, getTaskScore);

      if (scoreA && scoreB) {
        const rankA = scoreA.rank ?? 999;
        const rankB = scoreB.rank ?? 999;
        if (rankA !== rankB) return rankA - rankB;
        return (scoreB.score ?? 0) - (scoreA.score ?? 0);
      }
      if (scoreA) return -1;
      if (scoreB) return 1;
      return 0;
    });
  }

  if (sortOrder.length > 0) {
    return [...visibleTasks].sort((a, b) => {
      const indexA = sortOrder.indexOf(a.id);
      const indexB = sortOrder.indexOf(b.id);

      if (indexA !== -1 && indexB !== -1) {
        return indexA - indexB;
      }
      if (indexA !== -1) return -1;
      if (indexB !== -1) return 1;
      return 0;
    });
  }

  const persistedOrderValues = visibleTasks
    .map(task => task.sort_order)
    .filter(order => order !== null && order !== undefined);
  const hasPersistedTaskOrder = new Set(persistedOrderValues).size > 1;
  if (hasPersistedTaskOrder) {
    return [...visibleTasks].sort((a, b) => {
      const orderA = a.sort_order ?? 999999;
      const orderB = b.sort_order ?? 999999;
      if (orderA !== orderB) return orderA - orderB;
      return 0;
    });
  }

  if (hasStoredMtnScoring(visibleTasks, getTaskScore)) {
    return [...visibleTasks].sort((a, b) => {
      const scoreA = getVisibleTaskScore(a, getTaskScore);
      const scoreB = getVisibleTaskScore(b, getTaskScore);

      if (scoreA && scoreB) {
        const rankA = scoreA.rank ?? 999;
        const rankB = scoreB.rank ?? 999;
        if (rankA !== rankB) return rankA - rankB;
        return (scoreB.score ?? 0) - (scoreA.score ?? 0);
      }
      if (scoreA) return -1;
      if (scoreB) return 1;
      return 0;
    });
  }

  return [...visibleTasks].sort((a, b) => {
    if (a.in_top10 && !b.in_top10) return -1;
    if (!a.in_top10 && b.in_top10) return 1;

    if (a.in_top10 && b.in_top10) {
      const posA = a.top10_position ?? 999;
      const posB = b.top10_position ?? 999;
      return posA - posB;
    }

    const aPriority = prioritySortValue(a.priority);
    const bPriority = prioritySortValue(b.priority);

    if (aPriority !== bPriority) {
      return aPriority - bPriority;
    }

    if (a.due_date && b.due_date) {
      return new Date(a.due_date) - new Date(b.due_date);
    }
    if (a.due_date) return -1;
    if (b.due_date) return 1;

    return 0;
  });
};
