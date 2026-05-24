export const GOAL_LEVELS = {
  vision: {
    label: 'Vision',
    plural: 'Visions',
    legacy: 'long'
  },
  pillar: {
    label: 'Pillar',
    plural: 'Pillars',
    legacy: 'medium'
  },
  outcome: {
    label: 'Outcome',
    plural: 'Outcomes',
    legacy: 'short'
  }
};

const ALIASES = {
  long: 'vision',
  long_term: 'vision',
  vision: 'vision',
  medium: 'pillar',
  medium_term: 'pillar',
  pillar: 'pillar',
  short: 'outcome',
  short_term: 'outcome',
  outcome: 'outcome'
};

export const normalizeGoalLevel = (value, fallback = 'outcome') => (
  ALIASES[(value || fallback).toLowerCase()] || fallback
);

export const getGoalLevelLabel = (value) => {
  const level = normalizeGoalLevel(value);
  return GOAL_LEVELS[level]?.label || 'Goal';
};

export const isVision = (goal) => normalizeGoalLevel(goal?.time_horizon) === 'vision';
export const isPillar = (goal) => normalizeGoalLevel(goal?.time_horizon) === 'pillar';
export const isOutcome = (goal) => normalizeGoalLevel(goal?.time_horizon) === 'outcome';
