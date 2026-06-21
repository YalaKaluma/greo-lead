import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import MyCoachingSessions from "./MyCoachingSessions";
import { useLanguage } from "../i18n/LanguageContext";

const CENTER = { x: 500, y: 500 };
const R_CENTER = 116;
const R_DOMAIN = 240;
const R_SUBDOMAIN = 380;
const R_BELT = 412;

const BELTS = [
  { id: "white", name: "White Belt", shortName: "White", meaning: "Awareness", color: "#F8FAFC", text: "#111827" },
  { id: "yellow", name: "Yellow Belt", shortName: "Yellow", meaning: "Self-understanding", color: "#FACC15", text: "#111827" },
  { id: "green", name: "Green Belt", shortName: "Green", meaning: "Integration", color: "#22C55E", text: "#ffffff" },
  { id: "brown", name: "Brown Belt", shortName: "Brown", meaning: "Multiplication", color: "#92400E", text: "#ffffff" },
  { id: "black", name: "Black Belt", shortName: "Black", meaning: "Transformation", color: "#111827", text: "#ffffff" },
];

const BELT_IDS = BELTS.map((belt) => belt.id);
const VISIBLE_BELTS = BELTS.filter((belt) => belt.id !== "black");

const BELT_GUIDE = [
  {
    id: "white",
    statement: "I see the pieces.",
    description: "At White Belt, you begin to observe leadership intentionally.",
    focus: ["Goals", "Habits", "Relationships", "Energy", "Learning", "Execution"],
    objective: "Awareness",
    keyQuestion: "What are the elements that shape my life and leadership?",
  },
  {
    id: "yellow",
    statement: "I understand the pieces.",
    description: "At Yellow Belt, you move beyond awareness into understanding.",
    focus: [
      "Why you behave the way you do",
      "What drives your decisions",
      "Your strengths and blind spots",
      "The patterns that help or hurt your progress",
    ],
    objective: "Self-understanding",
    keyQuestion: "Why do these pieces matter, and how do they affect me?",
  },
  {
    id: "green",
    statement: "I connect the pieces.",
    description: "At Green Belt, leadership becomes a system rather than a collection of tools.",
    focus: [
      "Goals to daily actions",
      "Values to decisions",
      "Energy to performance",
      "Relationships to outcomes",
      "Learning to growth",
    ],
    objective: "Integration",
    keyQuestion: "How do all these pieces work together?",
  },
  {
    id: "brown",
    statement: "I can teach the pieces.",
    description: "At Brown Belt, leadership becomes transferable.",
    focus: [
      "Explain principles clearly",
      "Coach others",
      "Share lessons from experience",
      "Help others avoid mistakes",
      "Create clarity where others see confusion",
    ],
    objective: "Multiplication",
    keyQuestion: "Can I help someone else grow?",
  },
];

const DIMENSIONS = [
  {
    id: "vision",
    name: "Vision",
    brief: "Purpose, values, strengths, and long-term direction.",
    topics: [
      { id: "values", label: "Values", endpoint: "values" },
      { id: "strengths", label: "Strengths", endpoint: "strengths" },
      {
        id: "vision",
        label: "Vision",
        endpoint: "goals",
        filter: (item) => normalizeGoalLevel(item.time_horizon) === "vision",
      },
    ],
  },
  {
    id: "people",
    name: "People",
    brief: "Communication, delegation, inspiration, and trust.",
    topics: [
      { id: "team_composition", label: "Team Composition", endpoint: "people" },
      { id: "inspiration", label: "Inspire", endpoint: "inspiration" },
      { id: "coaching_moments", label: "Coach & Delegate", endpoint: "coaching-moments" },
    ],
  },
  {
    id: "execute",
    name: "Prioritize & Execute",
    brief: "Focus, discipline, prioritization, and delivery.",
    topics: [
      { id: "prioritization", label: "Prioritization", endpoint: "execution-systems", filter: (item) => normalizeCategory(item.category) === "prioritization" },
      { id: "execution_system", label: "Execution System", endpoint: "execution-systems", filter: (item) => normalizeCategory(item.category) !== "prioritization" },
      { id: "procrastination", label: "Procrastination", endpoint: "procrastination-patterns" },
    ],
    mvp: true,
  },
  {
    id: "energy",
    name: "Time & Energy",
    brief: "Recovery, capacity, energy management, and sustainability.",
    topics: [
      { id: "energy_sources", label: "Energy Sources", endpoint: "energy-sources" },
      { id: "energy_drains", label: "Energy Drains", endpoint: "energy-drains" },
      { id: "recovery", label: "Recovery", endpoint: "recovery-methods" },
    ],
  },
  {
    id: "learning",
    name: "Learning & Development",
    brief: "Growth, resilience, reflection, and continuous improvement.",
    topics: [
      { id: "failures", label: "Failures & Scars", endpoint: "failures" },
      { id: "development_opportunities", label: "Development Opportunities", endpoint: "development-areas" },
      { id: "development_plan", label: "Development Plan", endpoint: "opportunities" },
    ],
  },
];

const REDIRECT_TOPICS = {
  vision: { page: "my-goals", label: "Go to Vision" },
  team_composition: { page: "my-team", label: "Go to My Team" },
};

const TOPICS_REQUIRING_TITLES = new Set([
  "values",
  "strengths",
  "energy_sources",
  "energy_drains",
  "development_opportunities",
  "failures",
]);

const COLLAPSIBLE_EVIDENCE_TOPICS = new Set([
  "inspiration",
  "coaching_moments",
  "execution_system",
  "procrastination",
  "development_plan",
]);

const RECOMMENDATION_LABELS = {
  ready_for_promotion: "Ready for promotion",
  almost_ready: "Almost ready",
  not_ready: "Not yet ready",
  needs_more_evidence: "Needs more evidence",
  submitted: "Submitted",
};

const HEATMAP_COLORS = {
  1: "#DC2626",
  2: "#F97316",
  3: "#FACC15",
  4: "#86EFAC",
  5: "#16A34A",
};

const HEATMAP_TEXT = {
  1: "#FFFFFF",
  2: "#111827",
  3: "#111827",
  4: "#064E3B",
  5: "#FFFFFF",
};

const WHY_IT_MATTERS = {
  Values: "Values are the rules you follow when no one is watching. They make trade-offs easier to live with.",
  Strengths: "Leadership impact compounds when you deliberately use what already works.",
  Vision: "Vision names the direction your values and strengths are meant to serve.",
  "Team Composition": "The people around you shape your behavior more than your intentions.",
  Inspire: "Inspiration creates energy and alignment. Without it, leaders end up pushing instead of pulling.",
  "Coach & Delegate": "Coaching and delegation turn effort into leverage and protect your focus.",
  Prioritization: "Every yes quietly creates a no. Prioritization is the ability to say no without guilt.",
  "Execution System": "Willpower does not scale. A clear execution system creates progress without mental overload.",
  Procrastination: "Procrastination is usually a signal of resistance, fear, or misalignment, not laziness.",
  "Energy Sources": "Energy determines the quality of your decisions. Knowing what fuels you protects clarity.",
  "Energy Drains": "Some activities cost more than they appear. Identifying them allows redesign or containment.",
  Recovery: "Recovery is not a reward. It is a prerequisite for sustained leadership.",
  "Failures & Scars": "Unexamined experiences tend to repeat. Reflection turns experience into information.",
  "Development Opportunities": "Growth often hides inside discomfort. Naming it creates direction.",
  "Development Plan": "Insight only compounds when it leads to deliberate action.",
};

const LEADERSHIP_QUADRANT_LABELS = {
  vision_goals: "Vision",
  vision: "Vision",
  people: "People",
  prioritize_execute: "Prioritize & Execute",
  execute: "Prioritize & Execute",
  learning_development: "Learning & Development",
  learning: "Learning & Development",
  time_energy: "Time & Energy",
  energy: "Time & Energy",
};

const TOPIC_FORM_FIELDS = {
  Values: [
    { name: "title", label: "Title", type: "input" },
    { name: "value_text", label: "Value", type: "textarea", required: true },
    { name: "why", label: "Why it matters", type: "textarea" },
  ],
  Strengths: [
    { name: "title", label: "Title", type: "input" },
    { name: "strength", label: "Strength", type: "textarea", required: true },
    { name: "source", label: "Source", type: "input" },
  ],
  Vision: [
    { name: "title", label: "Title", type: "input" },
    { name: "goal_text", label: "Vision", type: "textarea", required: true },
    { name: "why", label: "Why", type: "textarea" },
    { name: "time_horizon", label: "Level", type: "hidden", defaultValue: "vision" },
  ],
  "Team Composition": [
    { name: "composition_text", label: "Composition", type: "textarea", required: true },
    { name: "team_type", label: "Team type", type: "input" },
    { name: "dynamics", label: "Dynamics", type: "textarea" },
  ],
  Inspire: [
    { name: "title", label: "Title", type: "input" },
    { name: "inspiration_text", label: "How you inspire", type: "textarea", required: true },
    { name: "approach", label: "Approach", type: "textarea" },
    { name: "effectiveness", label: "What works", type: "textarea" },
  ],
  "Coach & Delegate": [
    { name: "title", label: "Title", type: "input" },
    { name: "moment_text", label: "Moment", type: "textarea", required: true },
    { name: "person", label: "Person", type: "input" },
    { name: "outcome", label: "Outcome", type: "textarea" },
    { name: "learning", label: "Learning", type: "textarea" },
  ],
  Prioritization: [
    { name: "title", label: "Title", type: "input" },
    { name: "system_text", label: "System or approach", type: "textarea", required: true },
    { name: "category", label: "Category", type: "input", defaultValue: "prioritization" },
    { name: "effectiveness", label: "Effectiveness", type: "input" },
  ],
  "Execution System": [
    { name: "title", label: "Title", type: "input" },
    { name: "system_text", label: "System or approach", type: "textarea", required: true },
    { name: "category", label: "Category", type: "input" },
    { name: "effectiveness", label: "Effectiveness", type: "input" },
  ],
  Procrastination: [
    { name: "title", label: "Title", type: "input" },
    { name: "pattern_text", label: "Pattern", type: "textarea", required: true },
    { name: "underlying_reason", label: "Underlying reason", type: "textarea" },
    { name: "strategy", label: "Strategy", type: "textarea" },
  ],
  "Energy Sources": [
    { name: "title", label: "Title", type: "input" },
    { name: "source_text", label: "Energy source", type: "textarea", required: true },
    { name: "category", label: "Category", type: "input" },
  ],
  "Energy Drains": [
    { name: "title", label: "Title", type: "input" },
    { name: "drain_text", label: "Energy drain", type: "textarea", required: true },
    { name: "category", label: "Category", type: "input" },
    { name: "mitigation", label: "Mitigation strategy", type: "textarea" },
  ],
  Recovery: [
    { name: "title", label: "Title", type: "input" },
    { name: "method_text", label: "Recovery method", type: "textarea", required: true },
    { name: "category", label: "Category", type: "input" },
    { name: "frequency", label: "Frequency", type: "input" },
  ],
  "Failures & Scars": [
    { name: "title", label: "Title", type: "input" },
    { name: "failure_text", label: "Failure or scar", type: "textarea", required: true },
    { name: "learning", label: "Learning", type: "textarea" },
    { name: "scar", label: "Scar", type: "textarea" },
  ],
  "Development Opportunities": [
    { name: "title", label: "Title", type: "input" },
    { name: "skill", label: "Development area", type: "textarea", required: true },
    { name: "source", label: "Source", type: "input" },
  ],
  "Development Plan": [
    { name: "title", label: "Title", type: "input" },
    { name: "opportunity_text", label: "Opportunity", type: "textarea", required: true },
    { name: "source", label: "Source", type: "input" },
  ],
};

function getSubdomainQuestion(promptConfig, topic) {
  return promptConfig?.subdomains?.[topic?.id]?.question || WHY_IT_MATTERS[topic?.label] || "";
}

const FALLBACK_YELLOW_BELT_REQUIREMENTS = {
  vision: {
    reflection: {
      prompt: "Describe a vision that looks impressive on paper but may not be fully aligned with your values.",
      completion_hint: "Show self-awareness, ownership, and pattern recognition.",
    },
    real_world: {
      prompt: "Rewrite, retire, or clarify one vision statement so it better reflects what actually matters.",
      completion_hint: "Do one concrete action outside the app, then reflect on what happened.",
    },
    behavioral: {
      prompt: "Capture your vision, values, and strengths in Alfred.",
      completion_hint: "Alfred needs usage evidence before recommending promotion.",
    },
  },
  people: {
    reflection: {
      prompt: "Describe a recent interaction where your emotional reaction affected another person.",
      completion_hint: "Show self-awareness, ownership, and pattern recognition.",
    },
    real_world: {
      prompt: "Ask one person for specific feedback on how they experience your leadership.",
      completion_hint: "Do one concrete action outside the app, then reflect on what happened.",
    },
    behavioral: {
      prompt: "Capture a relationship reflection, delegation note, or coaching moment in Alfred.",
      completion_hint: "Alfred needs usage evidence before recommending promotion.",
    },
  },
  execute: {
    reflection: {
      prompt: "Explain how stress affects your execution, focus, and follow-through.",
      completion_hint: "Show self-awareness, ownership, and pattern recognition.",
    },
    real_world: {
      prompt: "Plan your top 3 priorities daily for one full workweek.",
      completion_hint: "Do one concrete action outside the app, then reflect on what happened.",
    },
    behavioral: {
      prompt: "Use Alfred's prioritization system and capture at least one execution system or procrastination pattern.",
      completion_hint: "Alfred needs usage evidence before recommending promotion.",
    },
  },
  energy: {
    reflection: {
      prompt: "Name what reliably drains you, what restores you, and the pattern you tend to ignore.",
      completion_hint: "Show self-awareness, ownership, and pattern recognition.",
    },
    real_world: {
      prompt: "Track your energy for 7 days and remove or contain one energy drain.",
      completion_hint: "Do one concrete action outside the app, then reflect on what happened.",
    },
    behavioral: {
      prompt: "Log energy sources, energy drains, recovery methods, or wellness habits in Alfred.",
      completion_hint: "Alfred needs usage evidence before recommending promotion.",
    },
  },
  learning: {
    reflection: {
      prompt: "Describe a failure that taught you something you still use today.",
      completion_hint: "Show self-awareness, ownership, and pattern recognition.",
    },
    real_world: {
      prompt: "Reflect on one major mistake and identify the lesson you want to carry forward.",
      completion_hint: "Do one concrete action outside the app, then reflect on what happened.",
    },
    behavioral: {
      prompt: "Capture a failure, development area, coaching reflection, or journal entry in Alfred.",
      completion_hint: "Alfred needs usage evidence before recommending promotion.",
    },
  },
};

function polar(cx, cy, r, angleDeg) {
  const a = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(a),
    y: cy + r * Math.sin(a),
  };
}

function wedgePath(r1, r2, a1, a2) {
  const p1 = polar(CENTER.x, CENTER.y, r2, a1);
  const p2 = polar(CENTER.x, CENTER.y, r2, a2);
  const p3 = polar(CENTER.x, CENTER.y, r1, a2);
  const p4 = polar(CENTER.x, CENTER.y, r1, a1);
  return `M ${p1.x} ${p1.y} A ${r2} ${r2} 0 0 1 ${p2.x} ${p2.y} L ${p3.x} ${p3.y} A ${r1} ${r1} 0 0 0 ${p4.x} ${p4.y} Z`;
}

function arcPath(r, a1, a2) {
  const start = polar(CENTER.x, CENTER.y, r, a1);
  const end = polar(CENTER.x, CENTER.y, r, a2);
  const largeArc = a2 - a1 > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

function splitLabel(label, maxLineLength = 13) {
  const words = label.split(" ");
  const lines = [];

  words.forEach((word) => {
    const lastLine = lines[lines.length - 1];
    if (lastLine && `${lastLine} ${word}`.length <= maxLineLength) {
      lines[lines.length - 1] = `${lastLine} ${word}`;
    } else {
      lines.push(word);
    }
  });

  return lines;
}

function getTopicItems(topic, topicData) {
  if (!topic) return [];

  const endpointItems = topicData[topic.endpoint] || [];
  return topic.filter ? endpointItems.filter(topic.filter) : endpointItems;
}

function normalizeCategory(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeGoalLevel(value) {
  const normalized = String(value || "vision").toLowerCase();
  const aliases = {
    long: "vision",
    long_term: "vision",
    vision: "vision",
    medium: "pillar",
    medium_term: "pillar",
    pillar: "pillar",
    short: "outcome",
    short_term: "outcome",
    outcome: "outcome",
  };

  return aliases[normalized] || normalized;
}

function getItemTitle(item) {
  return (
    item.title ||
    item.system_text ||
    item.pattern_text ||
    item.goal_text ||
    item.value_text ||
    item.strength ||
    item.value ||
    item.achievement ||
    item.name ||
    item.skill ||
    item.failure_text ||
    item.opportunity_text ||
    item.composition_text ||
    item.source_text ||
    item.drain_text ||
    item.method_text ||
    item.inspiration_text ||
    item.moment_text ||
    "Captured evidence"
  );
}

function getItemBody(item) {
  return (
    item.description ||
    item.effectiveness ||
    item.strategy ||
    item.underlying_reason ||
    item.why ||
    item.category ||
    item.source ||
    item.context ||
    item.dynamics ||
    item.approach ||
    item.lesson ||
    item.learning ||
    item.outcome ||
    item.mitigation ||
    item.frequency ||
    item.impact ||
    item.notes
  );
}

function getBelt(beltIndex) {
  return BELTS[beltIndex] || BELTS[0];
}

function normalizeBeltId(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+belt$/, "")
    .replace(/\s+/g, "_");

  return BELT_IDS.includes(normalized) ? normalized : "white";
}

function getBeltById(beltId) {
  const normalizedBeltId = normalizeBeltId(beltId);
  return BELTS.find((belt) => belt.id === normalizedBeltId) || BELTS[0];
}

function getBeltIndexById(beltId) {
  return Math.max(0, BELTS.findIndex((belt) => belt.id === normalizeBeltId(beltId)));
}

function getNextBeltId(currentBeltId) {
  const currentIndex = getBeltIndexById(currentBeltId);
  return BELTS[Math.min(currentIndex + 1, BELTS.length - 1)].id;
}

function inferStatus(score) {
  if (score >= 85) return "Passed";
  if (score >= 55) return "In Progress";
  if (score > 0) return "Needs Evidence";
  return "Not Started";
}

function getTelemetryAverage(telemetry) {
  return Math.round(telemetry.reduce((sum, signal) => sum + signal.value, 0) / Math.max(telemetry.length, 1));
}

function normalizeStatus(status) {
  return (status || "not_started").toLowerCase();
}

function isPassed(status) {
  return normalizeStatus(status) === "passed";
}

function getStatusProgress(status) {
  const normalized = normalizeStatus(status);

  if (normalized === "passed") return 1;
  if (normalized === "submitted") return 0.6;
  if (normalized === "needs_revision") return 0.45;
  if (normalized === "needs_deeper_reflection") return 0.45;
  if (normalized === "in_progress") return 0.25;
  if (normalized === "needs evidence") return 0.25;

  return 0;
}

function isStarted(status) {
  return getStatusProgress(status) > 0;
}

function hasText(value) {
  return String(value || "").trim().length > 0;
}

function isRequirementActive(requirement) {
  return requirement?.active !== false;
}

const TRIAL_TYPES = ["reflection", "real_world", "behavioral"];

function getActiveTrialTypes(requirements) {
  return TRIAL_TYPES
    .filter((trialType) => isRequirementActive(requirements?.[trialType]))
    .sort((first, second) => {
      const firstOrder = Number.isFinite(requirements?.[first]?.display_order)
        ? requirements[first].display_order
        : TRIAL_TYPES.indexOf(first) + 1;
      const secondOrder = Number.isFinite(requirements?.[second]?.display_order)
        ? requirements[second].display_order
        : TRIAL_TYPES.indexOf(second) + 1;
      return firstOrder - secondOrder || TRIAL_TYPES.indexOf(first) - TRIAL_TYPES.indexOf(second);
    });
}

function getStoredTrial(trialRecords, dimensionId, targetBeltId, trialType) {
  if (!dimensionId || !targetBeltId || !trialType) return null;

  return trialRecords.find(
    (trial) =>
      trial.dimension_id === dimensionId &&
      trial.target_belt === targetBeltId &&
      trial.trial_type === trialType
  );
}

function getLatestTrialReview(trial) {
  const history = Array.isArray(trial?.evidence?.feedback_history) ? trial.evidence.feedback_history : [];
  return trial?.evidence?.latest_review || history[history.length - 1] || {};
}

function getLatestTrialScore(trial) {
  const latestReview = getLatestTrialReview(trial);
  return latestReview?.score ?? trial?.score ?? null;
}

function getPrimaryFieldForTopic(topic) {
  if (topic?.id === "team_composition") {
    return { name: "name" };
  }

  const fields = TOPIC_FORM_FIELDS[topic?.label] || [];
  return fields.find((field) => field.required && field.type !== "hidden") ||
    fields.find((field) => field.type === "textarea") ||
    fields.find((field) => field.type !== "hidden");
}

function hasFilledTopicEvidence(topic, topicData) {
  const primaryField = getPrimaryFieldForTopic(topic);
  const items = getTopicItems(topic, topicData);

  return items.some((item) => {
    if (topic.id === "team_composition") {
      return hasText(item?.name) && (hasText(item?.relation) || hasText(item?.context));
    }

    const hasPrimaryAnswer = primaryField ? hasText(item?.[primaryField.name]) : false;
    const needsTitle = TOPICS_REQUIRING_TITLES.has(topic.id);
    return hasPrimaryAnswer && (!needsTitle || hasText(item?.title));
  });
}

function getWhiteBehavioralEvidenceStatus(dimensionId, topicData) {
  const dimension = DIMENSIONS.find((item) => item.id === dimensionId);
  if (!dimension?.topics?.length) return "not_started";

  const filledCount = dimension.topics.filter((topic) => hasFilledTopicEvidence(topic, topicData)).length;
  if (filledCount === dimension.topics.length) return "passed";
  if (filledCount > 0) return "in_progress";
  return "not_started";
}

function getYellowValidationBehavioralStatus(dimensionId, validation) {
  const dimensionValidation = validation?.dimensions?.find((item) => item.dimension === dimensionId);
  if (!dimensionValidation?.signals?.length) return null;
  if (dimensionValidation.passed) return "passed";
  if (dimensionValidation.signals.some((signal) => Number(signal.actual || 0) > 0)) return "in_progress";
  return "not_started";
}

function getValidationForBelt(targetBeltId, beltValidations) {
  if (targetBeltId === "yellow") return beltValidations?.yellow || null;
  return beltValidations?.[targetBeltId] || null;
}

function getDimensionValidation(dimensionId, targetBeltId, beltValidations) {
  const validation = getValidationForBelt(targetBeltId, beltValidations);
  return validation?.dimensions?.find((item) => item.dimension === dimensionId) || null;
}

function getTrialTypeValidation(dimensionId, targetBeltId, trialType, beltValidations) {
  const dimensionValidation = getDimensionValidation(dimensionId, targetBeltId, beltValidations);
  return dimensionValidation?.trial_types?.[trialType] || null;
}

function getSignalUnit(signal) {
  if (signal?.signal === "high_energy_habits_identified") return "habits";
  if (signal?.signal === "seven_day_habit_streak" || signal?.signal === "twenty_one_day_habit_streak") return "days";
  if (signal?.signal === "three_energy_level_journals") return "journals";
  if (signal?.signal === "three_energy_level_and_source_journals") return "journals";
  if (signal?.signal === "two_team_reviews" || signal?.signal === "two_team_reviews_needs_style") return "check-ins";
  if (signal?.signal === "mtn_classifications_reviewed" || signal?.signal === "move_the_needle_actions_flagged") return "reviews";
  if (signal?.signal === "vision_linked_to_values") return "visions";
  if (signal?.signal === "five_team_members_entered") return "team members";
  if (signal?.signal === "tasks_consistently_entered" || signal?.signal === "tasks_maintained") return "tasks";
  if (
    signal?.signal === "values_strengths_energy_journals" ||
    signal?.signal === "three_behavior_change_journals" ||
    signal?.signal === "seven_behavior_change_journals" ||
    signal?.signal === "scars_failures_behavior_reflections"
  ) return "reflections";
  return null;
}

function getSignalActual(signal) {
  return Number(signal?.actual || 0);
}

function getSignalRequired(signal) {
  return Number(signal?.required || 0);
}

function isSignalComplete(signal) {
  const required = getSignalRequired(signal);
  if (signal?.passed) return true;
  return required > 0 && getSignalActual(signal) >= required;
}

function formatSingleSignalProgress(signal) {
  const unit = getSignalUnit(signal);
  const required = getSignalRequired(signal);
  const actual = required > 0 ? Math.min(getSignalActual(signal), required) : getSignalActual(signal);
  return `${actual}/${required}${unit ? ` ${unit}` : ""}`;
}

function getPrimaryProgressSignal(signals) {
  const priority = [
    "scars_failures_behavior_reflections",
    "seven_behavior_change_journals",
    "three_behavior_change_journals",
    "three_energy_level_and_source_journals",
    "seven_day_habit_streak",
    "mtn_classifications_reviewed",
    "two_team_reviews",
    "vision_linked_to_values",
    "values_strengths_energy_journals",
    "three_energy_level_journals",
    "five_team_members_entered",
    "high_energy_habits_identified",
    "tasks_consistently_entered",
  ];
  const orderedSignals = priority.map((signalName) => signals.find((signal) => signal.signal === signalName)).filter(Boolean);
  return orderedSignals.find((signal) => !isSignalComplete(signal)) || orderedSignals[0] || null;
}

function formatSignalProgressDetail(signals) {
  if (!signals?.length) return null;

  if (signals.length === 1) {
    return formatSingleSignalProgress(signals[0]);
  }

  const primarySignal = getPrimaryProgressSignal(signals);
  if (primarySignal) {
    return formatSingleSignalProgress(primarySignal);
  }

  const completed = signals.filter((signal) => isSignalComplete(signal)).length;
  return `${completed}/${signals.length}`;
}

function getTrialProgressDetail(dimensionId, targetBeltId, trialType, beltValidations, topicData) {
  if (targetBeltId === "white" && trialType === "behavioral") {
    const dimension = DIMENSIONS.find((item) => item.id === dimensionId);
    const topics = dimension?.topics || [];
    if (!topics.length) return null;

    const completed = topics.filter((topic) => hasFilledTopicEvidence(topic, topicData)).length;
    return `${completed}/${topics.length}`;
  }

  const trialValidation = getTrialTypeValidation(dimensionId, targetBeltId, trialType, beltValidations);
  if (trialValidation?.signals?.length) return formatSignalProgressDetail(trialValidation.signals);

  const dimensionValidation = getDimensionValidation(dimensionId, targetBeltId, beltValidations);
  const signals = dimensionValidation?.signals || [];
  return trialType === "behavioral" ? formatSignalProgressDetail(signals) : null;
}

function getBehavioralStatus(dimensionId, targetBeltId, trialRecords, telemetryAverage, topicData, beltValidations) {
  const trialValidation = getTrialTypeValidation(dimensionId, targetBeltId, "behavioral", beltValidations);
  const validationStatus = trialValidation
    ? (
        trialValidation.passed || trialValidation.signals.every((signal) => isSignalComplete(signal))
          ? "passed"
          : trialValidation.signals.some((signal) => getSignalActual(signal) > 0)
            ? "in_progress"
            : "not_started"
      )
    : targetBeltId === "yellow"
      ? getYellowValidationBehavioralStatus(dimensionId, beltValidations?.yellow)
      : null;
  if (validationStatus && validationStatus !== "not_started") return validationStatus;

  const storedBehavioralTrial = getStoredTrial(trialRecords, dimensionId, targetBeltId, "behavioral");
  if (storedBehavioralTrial?.status) return normalizeStatus(storedBehavioralTrial.status);

  if (targetBeltId === "white") {
    return getWhiteBehavioralEvidenceStatus(dimensionId, topicData);
  }

  if (dimensionId === "execute") {
    return normalizeStatus(inferStatus(telemetryAverage));
  }

  return "not_started";
}

function getRealWorldStatus(dimensionId, targetBeltId, storedTrial, beltValidations) {
  const trialValidation = getTrialTypeValidation(dimensionId, targetBeltId, "real_world", beltValidations);
  if (trialValidation?.signals?.length) {
    if (trialValidation.passed) return "passed";
    if (trialValidation.signals.some((signal) => Number(signal.actual || 0) > 0)) return "in_progress";
  }
  return normalizeStatus(storedTrial?.status);
}

function getTargetBeltProgress(dimensionId, targetBeltId, trialRecords, telemetryAverage, trialConfig, topicData, beltValidations) {
  const requirements = getBeltRequirementsFromConfig(trialConfig, dimensionId, targetBeltId);
  const activeTrialTypes = getActiveTrialTypes(normalizeRequirements(requirements, dimensionId));
  const reflection = getStoredTrial(trialRecords, dimensionId, targetBeltId, "reflection");
  const realWorld = getStoredTrial(trialRecords, dimensionId, targetBeltId, "real_world");
  const realWorldStatus = getRealWorldStatus(dimensionId, targetBeltId, realWorld, beltValidations);
  const behavioralStatus = getBehavioralStatus(dimensionId, targetBeltId, trialRecords, telemetryAverage, topicData, beltValidations);
  const statuses = {
    reflection: reflection?.status,
    real_world: realWorldStatus,
    behavioral: behavioralStatus,
  };

  const completed = activeTrialTypes.filter((trialType) => isPassed(statuses[trialType])).length;
  const submitted = activeTrialTypes.filter((trialType) => normalizeStatus(statuses[trialType]) === "submitted").length;
  const started = activeTrialTypes.filter((trialType) => isStarted(statuses[trialType])).length;
  const weightedProgress = activeTrialTypes.reduce(
    (sum, trialType) => sum + getStatusProgress(statuses[trialType]),
    0
  );
  const requirementCount = Math.max(activeTrialTypes.length, 1);

  return {
    completed,
    submitted,
    started,
    requirementCount,
    percent: Math.round((weightedProgress / requirementCount) * 100),
    isComplete: completed === activeTrialTypes.length,
  };
}

function getDimensionProgression(dimensionId, trialRecords, telemetryAverage, trialConfig, topicData, beltValidations) {
  let currentBeltId = "white";
  let activeBeltId = "white";
  let nextBeltId = "yellow";

  for (const beltId of BELT_IDS) {
    const progress = getTargetBeltProgress(dimensionId, beltId, trialRecords, telemetryAverage, trialConfig, topicData, beltValidations);
    if (!progress.isComplete) {
      activeBeltId = beltId;
      nextBeltId = getNextBeltId(beltId);
      break;
    }

    currentBeltId = getNextBeltId(beltId);
    activeBeltId = currentBeltId;
    nextBeltId = getNextBeltId(currentBeltId);
  }

  if (currentBeltId === "black") {
    activeBeltId = "black";
    nextBeltId = "black";
  }

  const activeProgress = getTargetBeltProgress(dimensionId, activeBeltId, trialRecords, telemetryAverage, trialConfig, topicData, beltValidations);

  return {
    currentBeltId,
    activeBeltId,
    nextBeltId,
    currentBeltIndex: getBeltIndexById(currentBeltId),
    activeBeltIndex: getBeltIndexById(activeBeltId),
    nextBeltIndex: getBeltIndexById(nextBeltId),
    progress: activeProgress.percent,
    completedRequirements: activeProgress.completed,
    submittedRequirements: activeProgress.submitted,
    startedRequirements: activeProgress.started,
    requirementCount: activeProgress.requirementCount,
  };
}

function buildDimensionStates(telemetry, trialRecords, trialConfig, topicData, beltValidations) {
  const telemetryAverage = getTelemetryAverage(telemetry);

  return DIMENSIONS.reduce((states, dimension) => {
    const progression = getDimensionProgression(dimension.id, trialRecords, telemetryAverage, trialConfig, topicData, beltValidations);
    const hasAnyTrialEvidence = trialRecords.some((trial) => trial.dimension_id === dimension.id);
    const hasTelemetryEvidence = dimension.id === "execute" && telemetry.some((signal) => signal.value > 0);
    const hasEvidence = hasAnyTrialEvidence || hasTelemetryEvidence;
    const activeBelt = getBeltById(progression.activeBeltId);
    const nextBelt = getBeltById(progression.nextBeltId);

    states[dimension.id] = {
      beltIndex: progression.currentBeltIndex,
      currentBeltId: progression.currentBeltId,
      activeBeltId: progression.activeBeltId,
      nextBeltId: progression.nextBeltId,
      progress: progression.progress,
      momentum: progression.progress >= 55 && progression.currentBeltId !== "black",
      assessment: progression.currentBeltId === "black"
        ? `You are working the ${activeBelt.name} trials for this dimension. The work now is transmission: helping others develop this capability with judgment and humility.`
        : hasEvidence
          ? `Alfred sees ${progression.startedRequirements} of ${progression.requirementCount} ${activeBelt.name} requirements started, with ${progression.submittedRequirements} submitted and ${progression.completedRequirements} passed. Passing these trials is what moves you toward ${nextBelt.name}.`
          : `Start the ${activeBelt.name} trials. Passing them is what moves you toward ${nextBelt.name}.`,
      evidenceLabel: progression.currentBeltId === "black"
        ? `${progression.startedRequirements}/${progression.requirementCount} active`
        : hasEvidence
          ? `${progression.startedRequirements}/${progression.requirementCount} started`
          : "No earned evidence yet",
    };

    return states;
  }, {});
}

function getBeltRequirementsFromConfig(config, dimensionId, beltId) {
  const fullCurriculum = config?.dimensions?.[dimensionId]?.belts?.[beltId];
  if (fullCurriculum) return fullCurriculum;

  const legacyYellow = config?.yellow_belt?.dimensions?.[dimensionId];
  if (beltId === "yellow" && legacyYellow) return legacyYellow;

  return FALLBACK_YELLOW_BELT_REQUIREMENTS[dimensionId];
}

function beltHasActiveTrialContent(config, dimensionId, beltId) {
  const fullCurriculum = config?.dimensions?.[dimensionId]?.belts?.[beltId];
  if (!fullCurriculum) return true;

  return getActiveTrialTypes(normalizeRequirements(fullCurriculum, dimensionId)).length > 0;
}

export default function MyLeadershipJourney({ apiUrl, userNumber, onNavigate }) {
  const { t } = useLanguage();
  const [activeJourneyTab, setActiveJourneyTab] = useState("dojo");
  const [selectedDimensionId, setSelectedDimensionId] = useState("vision");
  const [signals, setSignals] = useState({
    goals: [],
    executionSystems: [],
    procrastination: [],
    goalReviews: [],
  });
  const [topicData, setTopicData] = useState({});
  const [loadingSignals, setLoadingSignals] = useState(false);
  const [activeTopic, setActiveTopic] = useState("Vision");
  const [trialRecords, setTrialRecords] = useState([]);
  const [beltValidations, setBeltValidations] = useState({});
  const [trialConfig, setTrialConfig] = useState(null);
  const [subdomainPromptConfig, setSubdomainPromptConfig] = useState(null);
  const [selectedTrialBeltId, setSelectedTrialBeltId] = useState(null);
  const [activeTrial, setActiveTrial] = useState(null);
  const [trialDraft, setTrialDraft] = useState("");
  const [savingTrial, setSavingTrial] = useState(false);
  const [trialSaveError, setTrialSaveError] = useState("");
  const [readinessStatus, setReadinessStatus] = useState(null);
  const [latestAssessment, setLatestAssessment] = useState(null);
  const [assessmentHistory, setAssessmentHistory] = useState([]);
  const [showAssessmentConfirm, setShowAssessmentConfirm] = useState(false);
  const [submittingAssessment, setSubmittingAssessment] = useState(false);
  const [acceptingPromotion, setAcceptingPromotion] = useState(false);
  const [assessmentError, setAssessmentError] = useState("");
  const [editingSubdomainItem, setEditingSubdomainItem] = useState(null);
  const [editingSubdomainTopic, setEditingSubdomainTopic] = useState(null);
  const [savingSubdomainItem, setSavingSubdomainItem] = useState(false);
  const [showWheelModal, setShowWheelModal] = useState(false);
  const [showBeltGuide, setShowBeltGuide] = useState(false);

  const selectedDimension = useMemo(
    () => DIMENSIONS.find((dimension) => dimension.id === selectedDimensionId) || DIMENSIONS[2],
    [selectedDimensionId]
  );

  useEffect(() => {
    if (!selectedDimension.topics.some((topic) => topic.label === activeTopic)) {
      setActiveTopic(selectedDimension.topics[0].label);
    }
  }, [activeTopic, selectedDimension]);

  useEffect(() => {
    if (apiUrl == null || !userNumber) return;

    let cancelled = false;
    const fetchSignals = async () => {
      setLoadingSignals(true);
      try {
        const [goals, executionSystems, procrastination, goalReviews] = await Promise.allSettled([
          axios.get(`${apiUrl}/api/journey/goals`, { params: { user_number: userNumber } }),
          axios.get(`${apiUrl}/api/journey/execution-systems`, { params: { user_number: userNumber } }),
          axios.get(`${apiUrl}/api/journey/procrastination-patterns`, { params: { user_number: userNumber } }),
          axios.get(`${apiUrl}/api/journey/goal-reviews`, { params: { user_number: userNumber } }),
        ]);
        const topicEndpoints = [
          ...new Set(DIMENSIONS.flatMap((dimension) => dimension.topics.map((topic) => topic.endpoint))),
        ];
        const topicResponses = await Promise.allSettled(
          topicEndpoints.map((endpoint) =>
            axios.get(`${apiUrl}/api/journey/${endpoint}`, { params: { user_number: userNumber } })
          )
        );

        if (cancelled) return;

        const nextTopicData = topicEndpoints.reduce((data, endpoint, index) => {
          const response = topicResponses[index];
          data[endpoint] = response.status === "fulfilled" ? response.value.data || [] : [];
          return data;
        }, {});

        setSignals({
          goals: goals.status === "fulfilled" ? goals.value.data || [] : [],
          executionSystems: executionSystems.status === "fulfilled" ? executionSystems.value.data || [] : [],
          procrastination: procrastination.status === "fulfilled" ? procrastination.value.data || [] : [],
          goalReviews:
            goalReviews.status === "fulfilled"
              ? goalReviews.value.data?.sessions || goalReviews.value.data || []
              : [],
        });
        setTopicData(nextTopicData);
      } catch (error) {
        console.error("Failed to load leadership telemetry", error);
      } finally {
        if (!cancelled) setLoadingSignals(false);
      }
    };

    fetchSignals();
    return () => {
      cancelled = true;
    };
  }, [apiUrl, userNumber]);

  useEffect(() => {
    if (apiUrl == null || !userNumber) return;

    let cancelled = false;
    const fetchBeltValidations = async () => {
      try {
        const [yellowResponse, greenResponse] = await Promise.allSettled(
          ["yellow", "green"].map((belt) =>
            axios.get(`${apiUrl}/api/journey/validation/${belt}`, {
              params: { user_number: userNumber },
            })
          )
        );
        if (!cancelled) {
          setBeltValidations((current) => ({
            ...current,
            yellow: yellowResponse.status === "fulfilled" ? yellowResponse.value.data || null : current.yellow,
            green: greenResponse.status === "fulfilled" ? greenResponse.value.data || null : current.green,
          }));
        }
      } catch (error) {
        console.error("Failed to load belt validation", error);
      }
    };

    fetchBeltValidations();
    return () => {
      cancelled = true;
    };
  }, [apiUrl, userNumber, trialRecords, topicData]);

  const refreshAssessmentData = async () => {
    if (apiUrl == null || !userNumber) return;

    try {
      const [statusResponse, latestResponse, historyResponse] = await Promise.allSettled([
        axios.get(`${apiUrl}/api/journey/belt-readiness/status`, { params: { user_number: userNumber } }),
        axios.get(`${apiUrl}/api/journey/belt-assessments/latest`, { params: { user_number: userNumber } }),
        axios.get(`${apiUrl}/api/journey/belt-assessments`, { params: { user_number: userNumber } }),
      ]);

      if (statusResponse.status === "fulfilled") setReadinessStatus(statusResponse.value.data);
      if (latestResponse.status === "fulfilled") setLatestAssessment(latestResponse.value.data || null);
      if (historyResponse.status === "fulfilled") setAssessmentHistory(historyResponse.value.data || []);
    } catch (error) {
      console.error("Failed to load belt assessment data", error);
    }
  };

  useEffect(() => {
    refreshAssessmentData();
  }, [apiUrl, userNumber, trialRecords, topicData]);

  useEffect(() => {
    if (apiUrl == null) return;

    let cancelled = false;
    const fetchTrialConfig = async () => {
      try {
        const response = await axios.get(`${apiUrl}/api/journey/trial-config`);
        if (!cancelled) setTrialConfig(response.data);
      } catch (error) {
        console.error("Failed to load journey trial config", error);
      }
    };

    fetchTrialConfig();
    return () => {
      cancelled = true;
    };
  }, [apiUrl]);

  useEffect(() => {
    if (apiUrl == null) return;

    let cancelled = false;
    const fetchSubdomainPrompts = async () => {
      try {
        const response = await axios.get(`${apiUrl}/api/journey/subdomain-prompts`);
        if (!cancelled) setSubdomainPromptConfig(response.data);
      } catch (error) {
        console.error("Failed to load journey subdomain prompts", error);
      }
    };

    fetchSubdomainPrompts();
    return () => {
      cancelled = true;
    };
  }, [apiUrl]);

  useEffect(() => {
    if (apiUrl == null || !userNumber) return;

    let cancelled = false;
    const fetchTrials = async () => {
      try {
        const response = await axios.get(`${apiUrl}/api/journey/belt-trials`, {
          params: { user_number: userNumber },
        });
        if (!cancelled) setTrialRecords(response.data || []);
      } catch (error) {
        console.error("Failed to load belt trials", error);
      }
    };

    fetchTrials();
    return () => {
      cancelled = true;
    };
  }, [apiUrl, userNumber]);

  const telemetry = useMemo(() => {
    const alignedGoals = signals.goals.filter((goal) => goal.parent_goal_id || goal.why).length;
    const executionCount = signals.executionSystems.length;
    const reviewCount = signals.goalReviews.length;
    const procrastinationCount = signals.procrastination.length;

    return [
      {
        label: "Priority System Use",
        value: Math.min(100, executionCount * 28 + reviewCount * 8),
        detail: `${executionCount} execution systems captured`,
      },
      {
        label: "Goal Alignment",
        value: signals.goals.length ? Math.round((alignedGoals / signals.goals.length) * 100) : 0,
        detail: `${alignedGoals} of ${signals.goals.length} goals include alignment context`,
      },
      {
        label: "Review Cadence",
        value: Math.min(100, reviewCount * 20),
        detail: `${reviewCount} goal review sessions found`,
      },
      {
        label: "Resistance Awareness",
        value: Math.min(100, procrastinationCount * 34),
        detail: `${procrastinationCount} procrastination patterns named`,
      },
    ];
  }, [signals]);

  const dimensionStates = useMemo(
    () => buildDimensionStates(telemetry, trialRecords, trialConfig, topicData, beltValidations),
    [telemetry, trialRecords, trialConfig, topicData, beltValidations]
  );

  const activeTopicConfig = useMemo(() => {
    return selectedDimension.topics.find((topic) => topic.label === activeTopic) || selectedDimension.topics[0];
  }, [activeTopic, selectedDimension]);

  const topicItems = useMemo(() => {
    return getTopicItems(activeTopicConfig, topicData);
  }, [activeTopicConfig, topicData]);

  const handleSelectDimension = (dimensionId) => {
    const nextDimension = DIMENSIONS.find((dimension) => dimension.id === dimensionId);
    setSelectedDimensionId(dimensionId);
    if (nextDimension?.topics?.length) {
      setActiveTopic(nextDimension.topics[0].label);
    }
  };

  const handleSelectSubdomain = (dimensionId, topic) => {
    setSelectedDimensionId(dimensionId);
    setActiveTopic(topic.label);
  };

  const updateTopicDataForEndpoint = (endpoint, items) => {
    const safeItems = Array.isArray(items) ? items : [];

    setTopicData((current) => ({
      ...current,
      [endpoint]: safeItems,
    }));
    setSignals((current) => ({
      ...current,
      goals: endpoint === "goals" ? safeItems : current.goals,
      executionSystems: endpoint === "execution-systems" ? safeItems : current.executionSystems,
      procrastination: endpoint === "procrastination-patterns" ? safeItems : current.procrastination,
    }));
  };

  const refreshTopicData = async (topic) => {
    if (!topic || apiUrl == null || !userNumber) return [];

    const response = await axios.get(`${apiUrl}/api/journey/${topic.endpoint}`, {
      params: { user_number: userNumber },
    });
    const data = response.data?.data || response.data || [];
    updateTopicDataForEndpoint(topic.endpoint, data);
    return data;
  };

  const handleAddSubdomainItem = (topic) => {
    const redirect = REDIRECT_TOPICS[topic.id];
    if (redirect && onNavigate) {
      onNavigate(redirect.page);
      return;
    }

    const fields = TOPIC_FORM_FIELDS[topic.label] || [];
    const draft = fields.reduce((item, field) => {
      item[field.name] = field.defaultValue || "";
      return item;
    }, { id: null, isNew: true });

    setEditingSubdomainTopic(topic);
    setEditingSubdomainItem(draft);
  };

  const handleEditSubdomainItem = (topic, item) => {
    setEditingSubdomainTopic(topic);
    setEditingSubdomainItem(item);
  };

  const handleSaveSubdomainItem = async (updates) => {
    if (!editingSubdomainTopic) return;

    setSavingSubdomainItem(true);
    try {
      const endpoint = editingSubdomainTopic.endpoint;
      const payload = { ...updates, user_number: userNumber };

      if (editingSubdomainItem?.id) {
        await axios.put(
          `${apiUrl}/api/journey/${endpoint}/${editingSubdomainItem.id}`,
          updates,
          { params: { user_number: userNumber } }
        );
      } else {
        await axios.post(`${apiUrl}/api/journey/${endpoint}`, payload, {
          params: { user_number: userNumber },
        });
      }

      await refreshTopicData(editingSubdomainTopic);
      setEditingSubdomainItem(null);
      setEditingSubdomainTopic(null);
    } catch (error) {
      console.error("Failed to save subdomain item", error);
      alert("Alfred could not save this Journey item yet. Please try again.");
    } finally {
      setSavingSubdomainItem(false);
    }
  };

  const handleDeleteSubdomainItem = async () => {
    if (!editingSubdomainTopic || !editingSubdomainItem?.id) return;
    if (!window.confirm(`Delete this ${editingSubdomainTopic.label.toLowerCase()} item?`)) return;

    setSavingSubdomainItem(true);
    try {
      await axios.delete(`${apiUrl}/api/journey/${editingSubdomainTopic.endpoint}/${editingSubdomainItem.id}`, {
        params: { user_number: userNumber },
      });
      await refreshTopicData(editingSubdomainTopic);
      setEditingSubdomainItem(null);
      setEditingSubdomainTopic(null);
    } catch (error) {
      console.error("Failed to delete subdomain item", error);
      alert("Alfred could not delete this Journey item yet. Please try again.");
    } finally {
      setSavingSubdomainItem(false);
    }
  };

  const selectedState = dimensionStates[selectedDimension.id];
  const normalizedReadinessCurrentBelt = normalizeBeltId(readinessStatus?.current_belt || latestAssessment?.target_belt || selectedState.currentBeltId);
  const journeyCurrentBelt = getBeltById(normalizedReadinessCurrentBelt);
  const journeyNextBelt = getBeltById(readinessStatus?.target_belt || getNextBeltId(journeyCurrentBelt.id));
  const isAssessmentLockedUntilYellow = readinessStatus?.assessment_locked_until_yellow || normalizedReadinessCurrentBelt === "white";
  const availableTrialBelts = VISIBLE_BELTS.filter((belt) =>
    beltHasActiveTrialContent(trialConfig, selectedDimension.id, belt.id)
  );

  useEffect(() => {
    if (isAssessmentLockedUntilYellow && activeJourneyTab === "assessment") {
      setActiveJourneyTab("dojo");
    }
  }, [isAssessmentLockedUntilYellow, activeJourneyTab]);

  const effectiveSelectedTrialBeltId = BELT_IDS.includes(normalizeBeltId(selectedTrialBeltId))
    ? normalizeBeltId(selectedTrialBeltId)
    : null;
  const viewedBelt = getBeltById(effectiveSelectedTrialBeltId || journeyCurrentBelt.id);
  const viewedBeltRequirements = getBeltRequirementsFromConfig(
    trialConfig,
    selectedDimension.id,
    viewedBelt.id
  );
  const viewedBehavioralStatus = getBehavioralStatus(
    selectedDimension.id,
    viewedBelt.id,
    trialRecords,
    getTelemetryAverage(telemetry),
    topicData,
    beltValidations
  );
  const viewedRealWorldTrial = getStoredTrial(trialRecords, selectedDimension.id, viewedBelt.id, "real_world");
  const viewedRealWorldStatus = getRealWorldStatus(
    selectedDimension.id,
    viewedBelt.id,
    viewedRealWorldTrial,
    beltValidations
  );
  const viewedRealWorldProgressDetail = getTrialProgressDetail(
    selectedDimension.id,
    viewedBelt.id,
    "real_world",
    beltValidations,
    topicData
  );
  const viewedBehavioralProgressDetail = getTrialProgressDetail(
    selectedDimension.id,
    viewedBelt.id,
    "behavioral",
    beltValidations,
    topicData
  );

  useEffect(() => {
    if (apiUrl == null || !userNumber || !readinessStatus) return;

    axios.post(`${apiUrl}/api/usage-events`, {
      user_number: userNumber,
      event_type: "diagnostic",
      page: "my-journey",
      feature: "journey_belt_view_state",
      metadata: {
        readiness_current_belt: readinessStatus?.current_belt || null,
        readiness_target_belt: readinessStatus?.target_belt || null,
        latest_assessment_target_belt: latestAssessment?.target_belt || null,
        selected_trial_belt_id: selectedTrialBeltId || null,
        selected_dimension_id: selectedDimension.id,
        active_topic: activeTopic,
        journey_current_belt_id: journeyCurrentBelt.id,
        journey_next_belt_id: journeyNextBelt.id,
        viewed_belt_id: viewedBelt.id,
        assessment_locked_until_yellow: Boolean(isAssessmentLockedUntilYellow),
        is_assessment_available: Boolean(readinessStatus?.is_assessment_available),
        is_eligible_to_submit: Boolean(readinessStatus?.is_eligible_to_submit),
        completed_trials: readinessStatus?.completed_trials ?? null,
        required_trials: readinessStatus?.required_trials ?? null,
        missing_trials_count: Array.isArray(readinessStatus?.missing_trials)
          ? readinessStatus.missing_trials.length
          : null,
      },
    }).catch(() => {
      // Diagnostic logging should never affect the Journey experience.
    });
  }, [
    apiUrl,
    userNumber,
    readinessStatus,
    latestAssessment,
    selectedTrialBeltId,
    selectedDimension.id,
    activeTopic,
    journeyCurrentBelt.id,
    journeyNextBelt.id,
    viewedBelt.id,
    isAssessmentLockedUntilYellow,
  ]);

  const handleStartTrial = async (trialType, prompt) => {
    const existing = trialRecords.find(
      (trial) =>
        trial.dimension_id === selectedDimension.id &&
        trial.target_belt === viewedBelt.id &&
        trial.trial_type === trialType
    );

    const trial =
      (existing && { ...existing, prompt }) ||
      {
        id: null,
        user_number: userNumber,
        dimension_id: selectedDimension.id,
        target_belt: viewedBelt.id,
        trial_type: trialType,
        prompt,
        response_text: "",
        status: "in_progress",
      };

    setActiveTrial(trial);
    setTrialDraft(trial.response_text || "");
    setTrialSaveError("");
  };

  const saveTrialResponse = async (status) => {
    if (!activeTrial || !trialDraft.trim()) return;

    setSavingTrial(true);
    setTrialSaveError("");
    try {
      const payload = {
        user_number: userNumber,
        dimension_id: activeTrial.dimension_id,
        target_belt: activeTrial.target_belt || "yellow",
        trial_type: activeTrial.trial_type,
        prompt: activeTrial.prompt,
        response_text: trialDraft.trim(),
        status,
      };
      const requestMode = activeTrial.id ? "update" : "create";
      console.info("[belt_trial_ui] saving", {
        mode: requestMode,
        trialId: activeTrial.id,
        dimensionId: activeTrial.dimension_id,
        targetBelt: activeTrial.target_belt || "yellow",
        trialType: activeTrial.trial_type,
        status,
        responseLength: trialDraft.trim().length,
      });

      const response = activeTrial.id
        ? await axios.put(
            `${apiUrl}/api/journey/belt-trials/${activeTrial.id}`,
            {
              response_text: trialDraft.trim(),
              status,
              prompt: activeTrial.prompt,
            },
            { params: { user_number: userNumber } }
          )
        : await axios.post(`${apiUrl}/api/journey/belt-trials`, payload);

      const updatedTrial = response.data;
      console.info("[belt_trial_ui] saved", {
        mode: requestMode,
        trialId: updatedTrial.id,
        status: updatedTrial.status,
        score: updatedTrial.score,
        reviewedAt: updatedTrial.reviewed_at,
        feedbackLength: updatedTrial.ai_feedback?.length || 0,
      });
      setTrialRecords((current) =>
        current.some((trial) => trial.id === updatedTrial.id)
          ? current.map((trial) => (trial.id === updatedTrial.id ? updatedTrial : trial))
          : [updatedTrial, ...current]
      );
      if (status === "submitted") {
        setActiveTrial(updatedTrial);
        setTrialDraft(updatedTrial.response_text || trialDraft.trim());
      } else {
        setActiveTrial(null);
        setTrialDraft("");
      }
    } catch (error) {
      console.error("Failed to submit belt trial", error);
      setTrialSaveError(error.response?.data?.detail?.message || error.response?.data?.detail || "Alfred could not save this exercise yet. Your text is still on screen; please try again.");
    } finally {
      setSavingTrial(false);
    }
  };

  const handleSaveTrial = async () => {
    await saveTrialResponse("in_progress");
  };

  const handleSubmitTrial = async () => {
    await saveTrialResponse("submitted");
  };

  const handleSubmitAssessment = async () => {
    if (!readinessStatus?.is_eligible_to_submit) return;

    setSubmittingAssessment(true);
    setAssessmentError("");
    try {
      const response = await axios.post(
        `${apiUrl}/api/journey/belt-assessments/submit`,
        {
          current_belt: readinessStatus.current_belt,
          target_belt: readinessStatus.target_belt,
        },
        { params: { user_number: userNumber } }
      );
      setLatestAssessment(response.data);
      await refreshAssessmentData();
      setShowAssessmentConfirm(false);
      setActiveJourneyTab("assessment");
    } catch (error) {
      console.error("Failed to submit belt assessment", error);
      setAssessmentError("Assessment generation ran into a problem. Please try again.");
    } finally {
      setSubmittingAssessment(false);
    }
  };

  const handleAcceptPromotion = async (assessment) => {
    if (!assessment?.id) return;

    setAcceptingPromotion(true);
    setAssessmentError("");
    try {
      const response = await axios.post(
        `${apiUrl}/api/journey/belt-assessments/${assessment.id}/accept-promotion`,
        {},
        { params: { user_number: userNumber } }
      );
      setLatestAssessment(response.data);
      await refreshAssessmentData();
    } catch (error) {
      console.error("Failed to accept belt promotion", error);
      setAssessmentError("Alfred could not record the promotion yet. Please try again.");
    } finally {
      setAcceptingPromotion(false);
    }
  };

  return (
    <div className="min-h-full bg-gray-50 px-4 py-5 text-slate-900 md:px-10 md:py-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-3xl font-semibold text-slate-950 md:text-4xl">
              {t('journey.title')}
            </h1>
          </div>

          <div className="flex flex-col gap-2 sm:items-end">
            {!isAssessmentLockedUntilYellow && readinessStatus?.is_eligible_to_submit ? (
              <button
                type="button"
                onClick={() => setShowAssessmentConfirm(true)}
                className="rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
              >
                Submit for Belt Assessment
              </button>
            ) : !isAssessmentLockedUntilYellow && readinessStatus?.required_trials ? (
              <p className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm">
                {Math.max((readinessStatus.required_trials || 0) - (readinessStatus.completed_trials || 0), 0)} trials remaining before {journeyNextBelt.name} assessment
              </p>
            ) : null}
            <div className="flex flex-wrap items-center justify-end gap-2">
              <div className="flex flex-wrap justify-end gap-2">
                {availableTrialBelts.map((belt) => (
                  <button
                    key={belt.name}
                    type="button"
                    onClick={() => setSelectedTrialBeltId(belt.id)}
                    className={`flex items-center gap-2 rounded-full border px-3 py-2 text-xs shadow-sm transition ${
                      viewedBelt.id === belt.id
                        ? "border-slate-950 bg-slate-950 text-white"
                        : "border-slate-200 bg-white text-slate-700 hover:border-slate-400"
                    }`}
                  >
                    <span
                      className="h-3 w-3 rounded-full border border-slate-300"
                      style={{ backgroundColor: belt.color }}
                    />
                    <span>{belt.shortName}</span>
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setShowBeltGuide(true)}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-300 bg-white text-lg font-semibold leading-none text-slate-700 shadow-sm transition hover:border-slate-500 hover:bg-slate-50 hover:text-slate-950 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2"
                aria-label="Show belt progression guide"
                title="Show belt progression guide"
              >
                +
              </button>
            </div>
          </div>
        </div>

        <div className="mb-6 border-b border-slate-200">
          <div className="flex flex-wrap gap-6">
          <button
            type="button"
            onClick={() => setActiveJourneyTab("leadership")}
            className={`relative px-2 pb-3 font-medium transition-colors ${
              activeJourneyTab === "leadership" ? "text-blue-600" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            My Leadership
            {activeJourneyTab === "leadership" && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveJourneyTab("dojo")}
            className={`relative px-2 pb-3 font-medium transition-colors ${
              activeJourneyTab === "dojo" ? "text-blue-600" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            My Dojo
            {activeJourneyTab === "dojo" && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />
            )}
          </button>
          {!isAssessmentLockedUntilYellow && (
            <button
              type="button"
              onClick={() => setActiveJourneyTab("assessment")}
              className={`relative px-2 pb-3 font-medium transition-colors ${
                activeJourneyTab === "assessment" ? "text-blue-600" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {t('journey.assessment')}
              {activeJourneyTab === "assessment" && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />
              )}
            </button>
          )}
          {!isAssessmentLockedUntilYellow && (
            <button
              type="button"
              onClick={() => setActiveJourneyTab("progress")}
              className={`relative px-2 pb-3 font-medium transition-colors ${
                activeJourneyTab === "progress" ? "text-blue-600" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {t('journey.progressReview')}
              {activeJourneyTab === "progress" && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />
              )}
            </button>
          )}
          <button
            type="button"
            onClick={() => setActiveJourneyTab("coaching")}
            className={`relative px-2 pb-3 font-medium transition-colors ${
              activeJourneyTab === "coaching" ? "text-blue-600" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {t('journey.coaching')}
            {activeJourneyTab === "coaching" && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />
            )}
          </button>
          </div>
        </div>

        {activeJourneyTab === "leadership" ? (
          <MyLeadershipTab
            dimension={selectedDimension}
            dimensionState={selectedState}
            currentBelt={journeyCurrentBelt}
            nextBelt={journeyNextBelt}
            latestAssessment={latestAssessment}
          />
        ) : !isAssessmentLockedUntilYellow && activeJourneyTab === "assessment" ? (
          <BeltAssessmentTab
            readinessStatus={readinessStatus}
            latestAssessment={latestAssessment}
            assessmentHistory={assessmentHistory}
            acceptingPromotion={acceptingPromotion}
            error={assessmentError}
            onSubmit={() => setShowAssessmentConfirm(true)}
            onAcceptPromotion={handleAcceptPromotion}
          />
        ) : !isAssessmentLockedUntilYellow && activeJourneyTab === "progress" ? (
          <JourneyProgressReviewTab
            readinessStatus={readinessStatus}
            currentBelt={journeyCurrentBelt}
            nextBelt={journeyNextBelt}
            latestAssessment={latestAssessment}
            assessmentHistory={assessmentHistory}
            dimensionStates={dimensionStates}
          />
        ) : activeJourneyTab === "coaching" ? (
          <LeadershipCoachingSessionsTab apiUrl={apiUrl} userNumber={userNumber} />
        ) : (
        <div className="grid gap-6 xl:grid-cols-[520px_minmax(0,1fr)]">
          <section className="space-y-5">
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <LeadershipWheel
                selectedDimensionId={selectedDimensionId}
                activeTopic={activeTopic}
                dimensionStates={dimensionStates}
                topicData={topicData}
                journeyBelt={journeyCurrentBelt}
                onSelectDimension={handleSelectDimension}
                onSelectSubdomain={handleSelectSubdomain}
                onSelectCenter={() => setShowWheelModal(true)}
              />
            </div>

            <TopicEvidencePanel
              dimension={selectedDimension}
              activeTopic={activeTopic}
              setActiveTopic={setActiveTopic}
              items={topicItems}
              promptConfig={subdomainPromptConfig}
              onNavigate={onNavigate}
              onAddItem={handleAddSubdomainItem}
              onEditItem={handleEditSubdomainItem}
            />
          </section>

          <section className="space-y-5">
            <BeltStepSummary
              dimension={selectedDimension}
              targetBelt={viewedBelt}
              requirements={viewedBeltRequirements}
            />

            <LeadershipStoryCard story={viewedBeltRequirements?.story} />

            <PathToNextBeltPanel
              dimension={selectedDimension}
              currentBelt={journeyCurrentBelt}
              targetBelt={viewedBelt}
              nextBelt={journeyNextBelt}
              requirements={viewedBeltRequirements}
              trialRecords={trialRecords}
              topicData={topicData}
              realWorldStatus={viewedRealWorldStatus}
              realWorldProgressDetail={viewedRealWorldProgressDetail}
              behavioralStatus={viewedBehavioralStatus}
              behavioralProgressDetail={viewedBehavioralProgressDetail}
              savingTrial={savingTrial}
              onStartTrial={handleStartTrial}
            />

            {selectedDimension.mvp && <TelemetryPanel telemetry={telemetry} loading={loadingSignals} />}
          </section>
        </div>
        )}
      </div>

      {showAssessmentConfirm && (
        <BeltAssessmentConfirmModal
          readinessStatus={readinessStatus}
          submitting={submittingAssessment}
          error={assessmentError}
          onClose={() => setShowAssessmentConfirm(false)}
          onSubmit={handleSubmitAssessment}
        />
      )}

      {showWheelModal && (
        <LeadershipWheelModal
          dimensionStates={dimensionStates}
          topicData={topicData}
          journeyBelt={journeyCurrentBelt}
          onClose={() => setShowWheelModal(false)}
        />
      )}

      {showBeltGuide && (
        <BeltGuideModal onClose={() => setShowBeltGuide(false)} />
      )}

      {activeTrial && (
        <TrialModal
          trial={activeTrial}
          draft={trialDraft}
          setDraft={setTrialDraft}
          saving={savingTrial}
          error={trialSaveError}
          onClose={() => {
            setActiveTrial(null);
            setTrialDraft("");
            setTrialSaveError("");
          }}
          onSave={handleSaveTrial}
          onSubmit={handleSubmitTrial}
        />
      )}

      {editingSubdomainItem && editingSubdomainTopic && (
        <SubdomainItemModal
          topic={editingSubdomainTopic}
          item={editingSubdomainItem}
          promptConfig={subdomainPromptConfig}
          values={topicData.values || []}
          saving={savingSubdomainItem}
          onClose={() => {
            setEditingSubdomainItem(null);
            setEditingSubdomainTopic(null);
          }}
          onSave={handleSaveSubdomainItem}
          onDelete={handleDeleteSubdomainItem}
        />
      )}
    </div>
  );
}

function JourneyProgressReviewTab({
  readinessStatus,
  currentBelt,
  nextBelt,
  latestAssessment,
  assessmentHistory,
  dimensionStates,
}) {
  const completedTrials = readinessStatus?.completed_trials ?? 0;
  const requiredTrials = readinessStatus?.required_trials ?? 0;
  const missingTrials = Array.isArray(readinessStatus?.missing_trials) ? readinessStatus.missing_trials : [];
  const trialCompletion = requiredTrials > 0 ? Math.round((completedTrials / requiredTrials) * 100) : 100;
  const latest = latestAssessment ? directAssessmentCopy(latestAssessment) : null;
  const dimensionRows = Object.values(dimensionStates || {});

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Journey Progress Review</p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-950">
              {currentBelt.name} progress toward {nextBelt.name}
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              A consolidated view of belt progress, recent assessment signal, and the leadership domains Alfred is tracking.
            </p>
          </div>
          <div className="grid min-w-[280px] grid-cols-2 overflow-hidden rounded-lg border border-slate-200">
            <div className="bg-slate-50 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Current</p>
              <p className="mt-1 font-semibold" style={{ color: currentBelt.color }}>{currentBelt.name}</p>
              <p className="mt-2 text-xs text-slate-500">{currentBelt.meaning}</p>
            </div>
            <div className="bg-white p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Next</p>
              <p className="mt-1 font-semibold" style={{ color: nextBelt.color }}>{nextBelt.name}</p>
              <p className="mt-2 text-xs text-slate-500">{nextBelt.meaning}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Required Trials</p>
              <h3 className="mt-1 text-xl font-semibold text-slate-950">{completedTrials}/{requiredTrials} complete</h3>
            </div>
            <span className="text-3xl font-semibold text-slate-950">{trialCompletion}%</span>
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-green-500" style={{ width: `${trialCompletion}%` }} />
          </div>
          <div className="mt-4 space-y-2">
            {missingTrials.length > 0 ? (
              missingTrials.slice(0, 6).map((trial, index) => (
                <div key={`${trial.dimension_id}-${trial.trial_type}-${index}`} className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
                  <span className="font-medium text-slate-800">{trial.domain} - {trial.trial_title}</span>
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{formatTrialStatus(trial.status)}</span>
                </div>
              ))
            ) : (
              <p className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm font-semibold text-green-700">
                All required trials for this belt are complete.
              </p>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Latest Assessment</p>
          {latest ? (
            <>
              <h3 className="mt-2 text-xl font-semibold text-slate-950">
                {RECOMMENDATION_LABELS[latest.recommendation] || latest.recommendation || "Assessment complete"}
              </h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">{latest.assessment_summary}</p>
              <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-wide text-slate-500">Journey Depth</p>
                <p className="mt-1 text-3xl font-semibold text-slate-950">{latest.readiness_score ?? "--"}</p>
                <p className="mt-2 text-xs text-slate-500">{formatDateTime(latest.created_at)}</p>
              </div>
            </>
          ) : (
            <p className="mt-2 text-sm leading-6 text-slate-600">
              No belt assessment has been generated yet. The review will sharpen after Alfred has an assessment snapshot.
            </p>
          )}
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Domain Snapshot</p>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {dimensionRows.map((state) => {
            const belt = getBeltById(state.currentBeltId);
            return (
              <div key={state.id} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h4 className="font-semibold text-slate-950">{state.name}</h4>
                    <p className="mt-1 text-xs text-slate-500">{belt.name}</p>
                  </div>
                  <span className="rounded-full border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700">
                    {state.completionScore}%
                  </span>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
                  <div className="h-full rounded-full" style={{ width: `${state.completionScore}%`, backgroundColor: belt.color }} />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {assessmentHistory.length > 0 && (
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Assessment History</p>
          <div className="mt-3 space-y-2">
            {assessmentHistory.slice(0, 5).map((assessment) => (
              <div key={assessment.id} className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm md:flex-row md:items-center md:justify-between">
                <span className="font-semibold text-slate-900">
                  {getBeltById(assessment.current_belt).name} to {getBeltById(assessment.target_belt).name}
                </span>
                <span className="text-slate-600">
                  {RECOMMENDATION_LABELS[assessment.recommendation] || assessment.recommendation || "Assessment"} - {formatDateTime(assessment.created_at)}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function MyLeadershipTab({ dimension, dimensionState, currentBelt, nextBelt, latestAssessment }) {
  const [selectedHeatmapSubdomain, setSelectedHeatmapSubdomain] = useState(null);
  const assessment = latestAssessment ? directAssessmentCopy(latestAssessment) : null;
  const wheelScores = assessment ? normalizeAssessmentWheel(assessment) : null;
  const selectedSubdomain = selectedHeatmapSubdomain || firstHeatmapSelection(wheelScores);

  return (
    <div className="space-y-5">
      <DimensionDeepDive
        dimension={dimension}
        dimensionState={dimensionState}
        belt={currentBelt}
        nextBelt={nextBelt}
        latestAssessment={latestAssessment}
      />

      {wheelScores ? (
        <>
          <BeltHeatmapAssessment
            wheelScores={wheelScores}
            selected={selectedSubdomain}
            onSelect={setSelectedHeatmapSubdomain}
          />
          <SubdomainDetailPanel selection={selectedSubdomain} />
        </>
      ) : (
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Leadership Wheel Heatmap</p>
          <h3 className="mt-2 text-xl font-semibold text-slate-950">No heatmap yet</h3>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Complete a belt assessment to unlock your latest leadership wheel heatmap.
          </p>
        </div>
      )}
    </div>
  );
}

function LeadershipCoachingSessionsTab({ apiUrl, userNumber }) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (apiUrl == null || !userNumber) return;

    let cancelled = false;
    const fetchSessions = async () => {
      setLoading(true);
      setError("");
      try {
        const response = await axios.get(`${apiUrl}/api/leadership-coaching/history`, {
          params: { user_number: userNumber },
        });
        if (!cancelled) setSessions(response.data?.sessions || []);
      } catch (fetchError) {
        console.error("Failed to load leadership coaching sessions", fetchError);
        if (!cancelled) setError("Leadership coaching sessions could not be loaded yet.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchSessions();
    return () => {
      cancelled = true;
    };
  }, [apiUrl, userNumber]);

  const latestSessions = sessions.slice(0, 5);

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-slate-950">Leadership Coaching Sessions</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Review recent leadership coaching work, then launch a new session when you want to work a live leadership challenge.
            </p>
          </div>
        </div>

        <div className="mt-5 space-y-3">
          {loading && <p className="text-sm text-slate-500">Loading coaching sessions...</p>}
          {error && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}
          {!loading && !error && latestSessions.length === 0 && (
            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-5 text-sm leading-6 text-slate-600">
              No leadership coaching sessions yet. Launch one below to begin building your leadership operating system through a real situation.
            </div>
          )}
          {latestSessions.map((session, index) => (
            <details
              key={session.id}
              open={index === 0}
              className="rounded-lg border border-slate-200 bg-slate-50 p-4"
            >
              <summary className="cursor-pointer text-sm font-semibold text-slate-950">
                {index === 0 ? "Latest Session" : `Session ${latestSessions.length - index}`} - {LEADERSHIP_QUADRANT_LABELS[session.quadrant] || session.quadrant || "Leadership Coaching"}
              </summary>
              <div className="mt-4 space-y-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {formatDateTime(session.completed_at || session.session_date)}
                </p>
                <LeadershipSessionField title="Situation" value={session.situation} />
                <LeadershipSessionField title="Pattern" value={session.pattern} />
                <LeadershipSessionField title="Insight" value={session.insights} />
                <LeadershipSessionField title="Practice" value={session.experiment || session.practice} />
                {session.development_level && (
                  <span className="inline-flex rounded-full border border-green-200 bg-green-50 px-3 py-1 text-xs font-semibold text-green-700">
                    Development level {session.development_level}/5
                  </span>
                )}
              </div>
            </details>
          ))}
        </div>
      </section>

      <section className="min-h-[720px] overflow-hidden rounded-md border border-slate-200 bg-white">
        <MyCoachingSessions
          apiUrl={apiUrl}
          userNumber={userNumber}
          visibleSessionTypes={["leadership_coaching"]}
          launchLabelByType={{ leadership_coaching: "Launch Leadership Coaching Session" }}
          emptyStateText="Launch a leadership coaching session to work through a live leadership challenge, identify the pattern underneath it, and choose a concrete experiment."
          loadInitialHistory={false}
        />
      </section>
    </div>
  );
}

function LeadershipSessionField({ title, value }) {
  if (!value) return null;

  return (
    <div className="rounded-md border border-slate-200 bg-white p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
      <p className="mt-2 text-sm leading-6 text-slate-700">{value}</p>
    </div>
  );
}

function LeadershipWheelModal({ dimensionStates, topicData, journeyBelt, onClose }) {
  const firstTopic = DIMENSIONS[0].topics[0];
  const [selected, setSelected] = useState({
    dimensionId: DIMENSIONS[0].id,
    dimensionName: DIMENSIONS[0].name,
    topic: firstTopic,
  });

  const selectedDimension = DIMENSIONS.find((dimension) => dimension.id === selected.dimensionId) || DIMENSIONS[0];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-3 md:p-6">
      <div className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-lg bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <h3 className="text-xl font-semibold text-slate-950">Leadership Operating System</h3>
            <p className="mt-1 text-sm leading-6 text-slate-600">Click a subdomain to see what it means and why it matters.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-xl leading-none text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            aria-label="Close leadership wheel"
          >
            x
          </button>
        </div>

        <div className="grid min-h-0 flex-1 gap-5 overflow-y-auto p-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)] lg:p-6">
          <div className="mx-auto w-full max-w-[640px]">
            <LeadershipWheel
              selectedDimensionId={selected.dimensionId}
              activeTopic={selected.topic.label}
              dimensionStates={dimensionStates}
              topicData={topicData}
              journeyBelt={journeyBelt}
              onSelectDimension={(dimensionId) => {
                const dimension = DIMENSIONS.find((item) => item.id === dimensionId) || DIMENSIONS[0];
                setSelected({
                  dimensionId,
                  dimensionName: dimension.name,
                  topic: dimension.topics[0],
                });
              }}
              onSelectSubdomain={(dimensionId, topic) => {
                const dimension = DIMENSIONS.find((item) => item.id === dimensionId) || DIMENSIONS[0];
                setSelected({
                  dimensionId,
                  dimensionName: dimension.name,
                  topic,
                });
              }}
            />
          </div>

          <aside className="rounded-lg border border-slate-200 bg-slate-50 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{selected.dimensionName}</p>
            <h4 className="mt-2 text-2xl font-semibold text-slate-950">{selected.topic.label}</h4>
            <div className="mt-5 space-y-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">What it is</p>
                <p className="mt-2 text-sm leading-6 text-slate-700">{getSubdomainDescription(selectedDimension, selected.topic)}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Why it matters</p>
                <p className="mt-2 text-sm leading-6 text-slate-700">
                  {WHY_IT_MATTERS[selected.topic.label] || "It gives Alfred a practical signal for how you think, choose, and act as a leader."}
                </p>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

function BeltGuideModal({ onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-3 md:p-6">
      <div className="flex max-h-[92vh] w-full max-w-[1480px] flex-col overflow-hidden rounded-lg bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 md:px-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Belt Progression</p>
            <h3 className="mt-1 text-2xl font-semibold text-slate-950">Leadership is not a destination.</h3>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              It is a progression. Each belt represents a different relationship with leadership. As you advance, the
              goal is not simply to gain knowledge, but to transform how you think, act, and influence others.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-xl leading-none text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            aria-label="Close belt progression guide"
          >
            x
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto bg-slate-50 px-4 py-5 md:px-6">
          <div className="grid min-w-[960px] gap-4 xl:grid-cols-4">
            {BELT_GUIDE.map((guide) => {
              const belt = getBeltById(guide.id);

              return (
                <article key={guide.id} className="flex min-h-[520px] flex-col rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-start gap-3">
                    <span
                      className="mt-1 h-4 w-4 flex-none rounded-full border border-slate-300"
                      style={{ backgroundColor: belt.color }}
                    />
                    <div className="min-w-0">
                      <h4 className="text-lg font-semibold text-slate-950">{belt.name}</h4>
                      <p className="mt-1 text-sm font-semibold text-slate-700">{guide.statement}</p>
                    </div>
                  </div>

                  <p className="mt-4 text-sm leading-6 text-slate-700">{guide.description}</p>

                  <div className="mt-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">You begin to</p>
                    <ul className="mt-2 grid gap-1.5 text-sm leading-6 text-slate-700 sm:grid-cols-2">
                      {guide.focus.map((item) => (
                        <li key={item} className="flex gap-2">
                          <span className="mt-2 h-1.5 w-1.5 flex-none rounded-full bg-slate-400" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="mt-auto rounded-md border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Objective</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">{guide.objective}</p>
                    <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Key Question</p>
                    <p className="mt-1 text-sm leading-6 text-slate-700">"{guide.keyQuestion}"</p>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function getSubdomainDescription(dimension, topic) {
  const descriptions = {
    Values: "The principles and standards you use to make decisions, especially when trade-offs are uncomfortable.",
    Strengths: "The recurring capabilities, traits, and patterns that create your strongest leadership impact.",
    Vision: "The future direction you are building toward and the reason your work deserves sustained effort.",
    "Team Composition": "The people, roles, relationships, and dynamics that shape how work actually gets done around you.",
    Inspire: "How you create meaning, energy, confidence, and alignment for the people you lead.",
    "Coach & Delegate": "How you grow others, transfer ownership, and create leverage without abandoning support.",
    Prioritization: "How you decide what matters most, protect focus, and make trade-offs across competing demands.",
    "Execution System": "The routines, tools, and operating rhythms that turn priorities into reliable progress.",
    Procrastination: "The resistance patterns that delay action and reveal fear, ambiguity, misalignment, or overload.",
    "Energy Sources": "The work, relationships, and rhythms that renew your clarity, motivation, and leadership capacity.",
    "Energy Drains": "The activities, frictions, and conditions that quietly consume attention and reduce leadership quality.",
    Recovery: "The deliberate practices that restore capacity so your leadership stays sustainable.",
    "Failures & Scars": "The experiences that shaped you, including what hurt, what taught you, and what still influences your behavior.",
    "Development Opportunities": "The skills, situations, and edges where growth would unlock stronger leadership range.",
    "Development Plan": "The concrete plan that turns insight into practice, repetition, and visible behavior change.",
  };

  return descriptions[topic.label] || dimension.brief;
}

function BeltAssessmentConfirmModal({ readinessStatus, submitting, error, onClose, onSubmit }) {
  const currentBelt = getBeltById(readinessStatus?.current_belt || "white");
  const targetBelt = getBeltById(readinessStatus?.target_belt || "yellow");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
      <div className="w-full max-w-xl overflow-hidden rounded-lg bg-white shadow-2xl">
        <div className="border-b border-slate-200 px-6 py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-700">
                Belt Readiness
              </p>
              <h3 className="mt-1 text-xl font-semibold text-slate-950">Submit your case to Alfred?</h3>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-2 py-1 text-xl leading-none text-slate-500 hover:bg-slate-100 hover:text-slate-800"
              aria-label="Close assessment confirmation"
            >
              x
            </button>
          </div>
        </div>

        <div className="space-y-4 px-6 py-5">
          <p className="text-sm leading-6 text-slate-700">
            Alfred will review your completed {currentBelt.name} Journey work and assess whether your answers show
            enough reflection depth, honesty, specificity, and actionability for {targetBelt.name}.
          </p>
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-900">
            {readinessStatus?.completed_trials || 0} of {readinessStatus?.required_trials || 0} required items complete
          </div>
          {error && <p className="text-sm font-semibold text-red-700">{error}</p>}
        </div>

        <div className="flex flex-col-reverse gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4 sm:flex-row sm:justify-end">
          <button
            type="button"
            disabled={submitting}
            onClick={onClose}
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={onSubmit}
            className="rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {submitting ? "Alfred is reviewing..." : "Submit for Assessment"}
          </button>
        </div>
      </div>
    </div>
  );
}

function formatDateTime(value) {
  if (!value) return "Not submitted yet";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function directAssessmentCopy(value) {
  if (typeof value === "string") {
    const replacements = {
      "the user is": "you are",
      "the user has": "you have",
      "the user shows": "you show",
      "the user demonstrates": "you demonstrate",
      "the user needs": "you need",
      "the user's": "your",
      "The user is": "You are",
      "The user has": "You have",
      "The user shows": "You show",
      "The user demonstrates": "You demonstrate",
      "The user needs": "You need",
      "The user's": "Your",
      "the user": "you",
      "The user": "You",
    };
    return Object.entries(replacements).reduce((text, [from, to]) => text.replaceAll(from, to), value);
  }
  if (Array.isArray(value)) return value.map(directAssessmentCopy);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, directAssessmentCopy(item)]));
  }
  return value;
}

function heatmapColor(score) {
  const value = Math.max(1, Math.min(5, Number(score) || 1));
  return HEATMAP_COLORS[value] || "#E5E7EB";
}

function heatmapTextColor(score) {
  const value = Math.max(1, Math.min(5, Number(score) || 1));
  return HEATMAP_TEXT[value] || "#111827";
}

function normalizeAssessmentWheel(assessment) {
  if (assessment?.wheel_scores && Object.keys(assessment.wheel_scores).length > 0) {
    return assessment.wheel_scores;
  }
  const legacy = assessment?.wheel_feedback || {};
  const wheel = {};
  DIMENSIONS.forEach((dimension) => {
    const domain = legacy[dimension.name] || {};
    const subdomains = {};
    dimension.topics.forEach((topic) => {
      const item = domain?.subdomains?.[topic.label] || {};
      subdomains[topic.label] = {
        score: Number(item.score) || 1,
        status: item.status || "needs evidence",
        current_readiness: item.current_readiness || item.assessment || `Your current belt work in ${topic.label} needs deeper, more specific reflection before Alfred can coach from it with confidence.`,
        why: item.why || item.evidence_observed || item.missing_evidence || `This part of the wheel needs clearer examples, more honest detail, and more actionable reflection before it can support promotion.`,
        improve: item.improve || item.next_actions_in_alfred || [WHY_IT_MATTERS[topic.label] || `Add one concrete reflection for ${topic.label}.`],
      };
    });
    const domainScores = Object.values(subdomains).map((item) => Number(item.score) || 1);
    wheel[dimension.name] = {
      domain_score: Number(domain.domain_score) || Math.round(domainScores.reduce((sum, score) => sum + score, 0) / domainScores.length),
      summary: domain.summary || domain.overall_assessment || `Your ${dimension.name} score reflects the depth, specificity, and actionability of the current belt work.`,
      subdomains,
    };
  });
  return wheel;
}

function firstHeatmapSelection(wheelScores) {
  for (const dimension of DIMENSIONS) {
    const subdomainName = dimension.topics[0]?.label;
    const feedback = wheelScores?.[dimension.name]?.subdomains?.[subdomainName];
    if (feedback) {
      return { domain: dimension.name, subdomain: subdomainName, feedback };
    }
  }
  return null;
}

function BeltAssessmentTab({ readinessStatus, latestAssessment, assessmentHistory, acceptingPromotion, error, onSubmit, onAcceptPromotion }) {
  const [selectedHeatmapSubdomain, setSelectedHeatmapSubdomain] = useState(null);
  const [selectedAssessmentId, setSelectedAssessmentId] = useState(null);
  const isLockedUntilYellow = readinessStatus?.assessment_locked_until_yellow || readinessStatus?.current_belt === "white";

  if (isLockedUntilYellow) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Leadership Assessment</p>
        <h2 className="mt-2 text-2xl font-semibold text-slate-950">Leadership Assessment</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
          Your leadership assessment becomes available once you reach Yellow Belt. Complete your early Journey exercises, gather evidence through real actions, and Alfred will unlock your first assessment when you are ready.
        </p>
      </div>
    );
  }

  if (!latestAssessment) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Belt Assessment</p>
        <h2 className="mt-2 text-2xl font-semibold text-slate-950">No assessment yet</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
          Once all required belt work is complete, Alfred can review the depth, honesty, and actionability of your Journey work.
        </p>
        {readinessStatus?.is_eligible_to_submit ? (
          <button
            type="button"
            onClick={onSubmit}
            className="mt-5 rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Submit for Belt Assessment
          </button>
        ) : (
          <p className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm font-semibold text-slate-600">
            Complete all remaining trials to unlock belt assessment.
          </p>
        )}
      </div>
    );
  }

  const selectedAssessment =
    assessmentHistory.find((item) => item.id === selectedAssessmentId) ||
    latestAssessment;
  const assessment = directAssessmentCopy(selectedAssessment);
  const currentBelt = getBeltById(assessment.current_belt);
  const targetBelt = getBeltById(assessment.target_belt);
  const recommendation = RECOMMENDATION_LABELS[assessment.recommendation] || assessment.recommendation || "Assessment complete";
  const isReady = assessment.recommendation === "ready_for_promotion";
  const coachingNote = assessment.alfred_coaching_note || assessment.final_coaching_note;
  const wheelScores = normalizeAssessmentWheel(assessment);
  const selectedSubdomain = selectedHeatmapSubdomain || firstHeatmapSelection(wheelScores);

  return (
    <div className="space-y-5">
      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</div>}

      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Belt Assessment</p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-950">{recommendation}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">{assessment.assessment_summary}</p>
          </div>
          <div className="grid min-w-[280px] grid-cols-2 overflow-hidden rounded-lg border border-slate-200">
            <div className="bg-slate-50 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Current Belt</p>
              <p className="mt-1 font-semibold" style={{ color: currentBelt.color }}>{currentBelt.name}</p>
              <p className="mt-2 text-xs text-slate-500">{formatDateTime(assessment.created_at)}</p>
            </div>
            <div className="bg-white p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Target Belt</p>
              <p className="mt-1 font-semibold" style={{ color: targetBelt.color }}>{targetBelt.name}</p>
              <p className="mt-2 text-xs uppercase tracking-wide text-slate-500">Journey Depth</p>
              <p className="mt-2 text-3xl font-semibold text-slate-950">{assessment.readiness_score ?? "--"}</p>
            </div>
          </div>
        </div>

        {isReady && !assessment.accepted_at && (
          <button
            type="button"
            disabled={acceptingPromotion}
            onClick={() => onAcceptPromotion(assessment)}
            className="mt-5 rounded-md bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-400 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {acceptingPromotion ? "Recording promotion..." : `Accept Belt Promotion`}
          </button>
        )}
        {assessment.accepted_at && (
          <p className="mt-5 rounded-lg border border-green-200 bg-green-50 p-4 text-sm font-semibold text-green-700">
            Promotion accepted on {formatDateTime(assessment.accepted_at)}.
          </p>
        )}
      </div>

      <LeadershipProfileSection profile={assessment.leadership_profile} />
      <BeltHeatmapAssessment
        wheelScores={wheelScores}
        selected={selectedSubdomain}
        onSelect={setSelectedHeatmapSubdomain}
      />
      <SubdomainDetailPanel selection={selectedSubdomain} />
      <PromotionLimitersPanel items={assessment.promotion_limiters} />
      <StrongestAreasPanel items={assessment.strongest_areas} />
      <PriorityNextActions actions={assessment.priority_next_actions || assessment.required_next_actions} />

      {coachingNote && (
        <div className="rounded-lg border border-[#ded7c8] bg-[#fbfaf7] p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#7c4a2d]">Alfred's Coaching Note</p>
          <p className="mt-3 text-sm leading-6 text-slate-700">{coachingNote}</p>
        </div>
      )}

      <DevelopmentalScoringAccordion
        assessment={assessment}
        wheelScores={wheelScores}
        scores={assessment.journey_depth_scores || assessment.developmental_dimension_scores || assessment.dimension_scores}
      />

      {assessmentHistory.length > 1 && (
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">History</p>
          <div className="mt-3 space-y-2">
            {assessmentHistory.map((historyItem) => (
              <button
                key={historyItem.id}
                type="button"
                onClick={() => {
                  setSelectedAssessmentId(historyItem.id);
                  setSelectedHeatmapSubdomain(null);
                }}
                className={`flex w-full items-center justify-between rounded-lg border p-3 text-left text-sm transition hover:border-slate-400 ${
                  historyItem.id === assessment.id ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 bg-slate-50 text-slate-700"
                }`}
              >
                <span>{formatDateTime(historyItem.created_at)}</span>
                <span className="font-semibold">{RECOMMENDATION_LABELS[historyItem.recommendation] || historyItem.recommendation}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function LeadershipProfileSection({ profile }) {
  if (!profile) return null;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Leadership Profile</p>
      <h3 className="mt-2 text-xl font-semibold text-slate-950">{profile.headline || "Emerging Leadership Profile"}</h3>
      {profile.description && <p className="mt-3 text-sm leading-6 text-slate-700">{profile.description}</p>}
      {profile.current_growth_edge && (
        <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-900">
          Growth edge: {profile.current_growth_edge}
        </p>
      )}
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <AssessmentListBlock title="Likely Strengths" items={profile.likely_strengths} />
        <AssessmentListBlock title="Likely Risks" items={profile.likely_risks} />
      </div>
    </div>
  );
}

function BeltHeatmapAssessment({ wheelScores, selected, onSelect }) {
  if (!wheelScores || Object.keys(wheelScores).length === 0) return null;

  const domainAngle = 360 / DIMENSIONS.length;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Leadership Wheel Heatmap</p>
          <h3 className="mt-2 text-xl font-semibold text-slate-950">Where your Journey work is deep, and where it needs more depth</h3>
        </div>
        <div className="flex flex-wrap gap-2 text-xs font-semibold text-slate-700">
          {[1, 2, 3, 4, 5].map((score) => (
            <span key={`legend-${score}`} className="inline-flex items-center gap-1">
              <span className="h-3 w-3 rounded-sm" style={{ background: heatmapColor(score) }} />
              {score}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(320px,520px)_1fr] lg:items-center">
        <div className="mx-auto w-full max-w-[520px]">
          <svg viewBox="0 0 1000 1000" className="h-auto w-full" role="img" aria-label="Leadership Wheel heatmap">
            <circle cx={CENTER.x} cy={CENTER.y} r={R_CENTER - 8} fill="#020617" />
            <text x={CENTER.x} y={CENTER.y - 8} textAnchor="middle" className="fill-white text-[38px] font-semibold">Alfred</text>
            <text x={CENTER.x} y={CENTER.y + 34} textAnchor="middle" className="fill-amber-200 text-[20px] font-semibold">Assessment</text>

            {DIMENSIONS.map((dimension, domainIndex) => {
              const a1 = -90 + domainIndex * domainAngle;
              const a2 = a1 + domainAngle;
              const domain = wheelScores[dimension.name] || {};
              return (
                <g key={`heat-domain-${dimension.id}`}>
                  <path d={wedgePath(R_CENTER, R_DOMAIN, a1, a2)} fill="#F8FAFC" stroke="#CBD5E1" strokeWidth="2" />
                  {(() => {
                    const mid = (a1 + a2) / 2;
                    const pos = polar(CENTER.x, CENTER.y, (R_CENTER + R_DOMAIN) / 2, mid);
                    return splitLabel(dimension.name, 13).map((line, index, lines) => (
                      <text
                        key={`${dimension.id}-label-${line}`}
                        x={pos.x}
                        y={pos.y + (index - (lines.length - 1) / 2) * 20}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        className="pointer-events-none fill-slate-950 text-[18px] font-semibold"
                      >
                        {line}
                      </text>
                    ));
                  })()}
                  {dimension.topics.map((topic, topicIndex) => {
                    const topicAngle = domainAngle / dimension.topics.length;
                    const ta1 = a1 + topicIndex * topicAngle;
                    const ta2 = ta1 + topicAngle;
                    const feedback = domain?.subdomains?.[topic.label] || {};
                    const score = Number(feedback.score) || 1;
                    const active = selected?.domain === dimension.name && selected?.subdomain === topic.label;
                    const mid = (ta1 + ta2) / 2;
                    const pos = polar(CENTER.x, CENTER.y, (R_DOMAIN + R_SUBDOMAIN) / 2, mid);
                    return (
                      <g key={`heat-topic-${topic.id}`}>
                        <path
                          d={wedgePath(R_DOMAIN, R_SUBDOMAIN, ta1, ta2)}
                          fill={heatmapColor(score)}
                          stroke={active ? "#020617" : "#F8FAFC"}
                          strokeWidth={active ? "6" : "3"}
                          className="cursor-pointer transition-opacity hover:opacity-80"
                          onClick={() => onSelect({ domain: dimension.name, subdomain: topic.label, feedback })}
                        />
                        {splitLabel(topic.label, 12).map((line, index, lines) => (
                          <text
                            key={`${topic.id}-heat-label-${line}`}
                            x={pos.x}
                            y={pos.y + (index - (lines.length - 1) / 2) * 18}
                            textAnchor="middle"
                            dominantBaseline="middle"
                            className="pointer-events-none text-[15px] font-semibold"
                            fill={heatmapTextColor(score)}
                          >
                            {line}
                          </text>
                        ))}
                      </g>
                    );
                  })}
                </g>
              );
            })}
          </svg>
        </div>

        <div className="space-y-3">
          {DIMENSIONS.map((dimension) => {
            const domain = wheelScores[dimension.name] || {};
            return (
              <button
                type="button"
                key={`domain-summary-${dimension.id}`}
                onClick={() => {
                  const topic = dimension.topics[0];
                  onSelect({
                    domain: dimension.name,
                    subdomain: topic.label,
                    feedback: domain?.subdomains?.[topic.label] || {},
                  });
                }}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 p-3 text-left hover:border-slate-400"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-slate-950">{dimension.name}</p>
                  <span
                    className="rounded-full px-2 py-1 text-xs font-semibold"
                    style={{ background: heatmapColor(domain.domain_score), color: heatmapTextColor(domain.domain_score) }}
                  >
                    {domain.domain_score ?? "--"}/5
                  </span>
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-600">{domain.summary}</p>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function SubdomainDetailPanel({ selection }) {
  if (!selection) return null;
  const feedback = selection.feedback || {};
  const improve = feedback.improve || feedback.next_actions_in_alfred || [];

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{selection.domain}</p>
          <h3 className="mt-2 text-xl font-semibold text-slate-950">{selection.subdomain}</h3>
          {feedback.status && <p className="mt-1 text-sm font-semibold capitalize text-slate-500">{feedback.status}</p>}
        </div>
        <span
          className="inline-flex w-fit items-center rounded-full px-3 py-1 text-sm font-semibold"
          style={{ background: heatmapColor(feedback.score), color: heatmapTextColor(feedback.score) }}
        >
          {feedback.score ?? "--"} / 5
        </span>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Journey Work Depth</p>
          <p className="mt-2 text-sm leading-6 text-slate-700">{feedback.current_readiness}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Why Alfred Scored This Way</p>
          <p className="mt-2 text-sm leading-6 text-slate-700">{feedback.why}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">What Would Improve This Score</p>
          <ul className="mt-2 space-y-2 text-sm leading-6 text-slate-700">
            {improve.map((item, index) => <li key={`improve-${index}`}>{item}</li>)}
          </ul>
        </div>
      </div>
    </div>
  );
}

function PromotionLimitersPanel({ items }) {
  if (!items?.length) return null;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">What Needs Deeper Work Before Promotion</p>
      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        {items.slice(0, 3).map((item, index) => (
          <article key={`limiter-${index}`} className="rounded-lg border border-orange-200 bg-orange-50 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-orange-700">{item.domain}</p>
                <h3 className="mt-1 text-sm font-semibold text-slate-950">{item.subdomain}</h3>
              </div>
              <span className="rounded-full bg-white px-2 py-1 text-xs font-semibold text-orange-700">{item.score}/5</span>
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-700">{item.why_it_limits_promotion}</p>
            <p className="mt-3 text-sm font-semibold leading-6 text-slate-950">{item.what_to_do_next}</p>
          </article>
        ))}
      </div>
    </div>
  );
}

function StrongestAreasPanel({ items }) {
  if (!items?.length) return null;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Deepest Reflection Areas</p>
      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        {items.slice(0, 3).map((item, index) => (
          <article key={`strongest-${index}`} className="rounded-lg border border-green-200 bg-green-50 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-green-700">{item.domain}</p>
                <h3 className="mt-1 text-sm font-semibold text-slate-950">{item.subdomain}</h3>
              </div>
              <span className="rounded-full bg-white px-2 py-1 text-xs font-semibold text-green-700">{item.score}/5</span>
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-700">{item.why_it_is_strong}</p>
          </article>
        ))}
      </div>
    </div>
  );
}

function AssessmentListBlock({ title, items }) {
  if (!items?.length) return null;

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      <ul className="mt-2 space-y-2 text-sm leading-6 text-slate-600">
        {items.map((item, index) => (
          <li key={`${title}-${index}`}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function WheelDomainSummary({ title, feedback, mode }) {
  if (!feedback || Object.keys(feedback).length === 0) return null;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{title}</p>
      <div className="mt-4 grid gap-3 lg:grid-cols-5">
        {Object.entries(feedback).map(([domainName, domain]) => {
          const subdomains = domain?.subdomains || {};
          const scored = Object.entries(subdomains).map(([name, value]) => ({
            name,
            score: Number(value?.score) || 0,
            feedback: value || {},
          }));
          const selected = scored.sort((a, b) => mode === "strengths" ? b.score - a.score : a.score - b.score)[0];
          const items = mode === "strengths" ? domain?.strengths : domain?.growth_edges;
          const detail = selected?.feedback || {};

          return (
            <article key={domainName} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <h3 className="text-sm font-semibold text-slate-950">{domainName}</h3>
              {selected && (
                <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {mode === "strengths" ? "Strongest" : "Weakest"}: {selected.name}
                </p>
              )}
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {mode === "strengths"
                  ? detail.evidence_observed || items?.[0] || domain?.overall_assessment
                  : detail.missing_evidence || detail.next_actions_in_alfred?.[0] || items?.[0]}
              </p>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function WheelFeedbackSection({ feedback }) {
  if (!feedback || Object.keys(feedback).length === 0) return null;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Leadership Wheel Feedback</p>
      <div className="mt-4 space-y-3">
        {Object.entries(feedback).map(([domainName, domain]) => (
          <details key={domainName} className="rounded-lg border border-slate-200 bg-slate-50 p-4" open>
            <summary className="cursor-pointer text-base font-semibold text-slate-950">{domainName}</summary>
            {domain?.overall_assessment && (
              <p className="mt-3 text-sm leading-6 text-slate-700">{domain.overall_assessment}</p>
            )}
            <div className="mt-4 grid gap-3 lg:grid-cols-3">
              {Object.entries(domain?.subdomains || {}).map(([subdomainName, subdomain]) => (
                <article key={subdomainName} className="rounded-lg border border-slate-200 bg-white p-4">
                  <div className="flex items-start justify-between gap-3">
                    <h4 className="text-sm font-semibold text-slate-950">{subdomainName}</h4>
                    <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800">
                      {subdomain?.score ?? "--"}/5
                    </span>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-slate-700">{subdomain?.assessment}</p>
                  <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Evidence Observed</p>
                  <p className="mt-1 text-sm leading-6 text-slate-600">{subdomain?.evidence_observed}</p>
                  <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Missing Evidence</p>
                  <p className="mt-1 text-sm leading-6 text-slate-600">{subdomain?.missing_evidence}</p>
                  {subdomain?.next_actions_in_alfred?.length > 0 && (
                    <>
                      <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Next Actions In Alfred</p>
                      <ul className="mt-1 space-y-1 text-sm leading-6 text-slate-600">
                        {subdomain.next_actions_in_alfred.map((action, index) => (
                          <li key={`${subdomainName}-action-${index}`}>{action}</li>
                        ))}
                      </ul>
                    </>
                  )}
                </article>
              ))}
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}

function PriorityNextActions({ actions }) {
  if (!actions?.length) return null;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Priority Next Actions</p>
      <div className="mt-4 space-y-3">
        {actions.map((item, index) => {
          const action = typeof item === "string" ? { action: item } : item;
          return (
            <article key={`priority-action-${index}`} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              {(action.domain || action.subdomain) && (
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {[action.domain, action.subdomain].filter(Boolean).join(" / ")}
                </p>
              )}
              <p className="mt-2 text-sm font-semibold text-slate-950">{action.action}</p>
              {action.why_it_matters && <p className="mt-2 text-sm leading-6 text-slate-600">{action.why_it_matters}</p>}
            </article>
          );
        })}
      </div>
    </div>
  );
}

function AssessmentListSection({ title, items }) {
  if (!items?.length) return null;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{title}</p>
      <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
        {items.map((item, index) => (
          <li key={`${title}-${index}`} className="rounded-lg bg-slate-50 p-3">{item}</li>
        ))}
      </ul>
    </div>
  );
}

function AssessmentScores({ scores }) {
  if (!scores || Object.keys(scores).length === 0) return null;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Journey Depth Dimensions</p>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {Object.entries(scores).map(([key, value]) => (
          <div key={key} className="rounded-lg border border-slate-200 p-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold capitalize text-slate-800">{key.replaceAll("_", " ")}</p>
              <span className="text-sm font-semibold text-slate-950">{value}/5</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-amber-500" style={{ width: `${Math.min(Number(value) || 0, 5) * 20}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function compactText(value, maxLength = 280) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trim()}...`;
}

function domainNameFromId(dimensionId) {
  return DIMENSIONS.find((dimension) => dimension.id === dimensionId)?.name || dimensionId || "Unknown domain";
}

function getSubdomainDebugRows(wheelScores) {
  const rows = [];
  DIMENSIONS.forEach((dimension) => {
    const domain = wheelScores?.[dimension.name] || {};
    dimension.topics.forEach((topic) => {
      const feedback = domain?.subdomains?.[topic.label] || {};
      rows.push({
        domain: dimension.name,
        subdomain: topic.label,
        score: Number(feedback.score) || 0,
        status: feedback.status,
        why: feedback.why,
        currentReadiness: feedback.current_readiness,
        improve: feedback.improve || [],
      });
    });
  });
  return rows;
}

function getEvidenceCounts(evidence) {
  const subdomainEvidence = evidence?.belt_subdomain_evidence || {};
  return DIMENSIONS.map((dimension) => {
    const count = dimension.topics.reduce((sum, topic) => {
      const items = subdomainEvidence?.[dimension.name]?.[topic.label] || [];
      return sum + items.length;
    }, 0);
    return { domain: dimension.name, count };
  });
}

function countGoalTreeNodes(goals) {
  return (goals || []).reduce((sum, goal) => sum + 1 + countGoalTreeNodes(goal.children || []), 0);
}

function DevelopmentalScoringAccordion({ assessment, wheelScores, scores }) {
  const evidence = assessment?.evidence_snapshot || {};
  const subdomainRows = getSubdomainDebugRows(wheelScores);
  const scoreValues = subdomainRows.map((row) => row.score).filter(Boolean);
  const averageScore = scoreValues.length ? (scoreValues.reduce((sum, score) => sum + score, 0) / scoreValues.length) : 0;
  const trials = evidence?.belt_trials || [];
  const evidenceCounts = getEvidenceCounts(evidence);
  const visionTree = evidence?.vision_goal_tree || [];
  const visionNodeCount = countGoalTreeNodes(visionTree);
  const roadmapWaveCount = visionTree.reduce((sum, vision) => sum + (vision.roadmap_waves?.length || 0), 0);
  if (!scores && subdomainRows.length === 0 && trials.length === 0) return null;

  return (
    <details className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <summary className="cursor-pointer text-sm font-semibold text-slate-950">How Alfred graded this</summary>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        Debug view: this shows the inputs considered and how the Journey Depth score was calculated.
      </p>

      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Formula</p>
          <p className="mt-2 text-sm leading-6 text-slate-700">
            Average of 15 subdomain scores x 20.
          </p>
          <p className="mt-2 text-sm font-semibold text-slate-950">
            {averageScore.toFixed(2)} / 5 = {Math.round(averageScore * 20)} / 100
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Pass Threshold</p>
          <p className="mt-2 text-sm leading-6 text-slate-700">
            3.0 / 5 average passes.
          </p>
          <p className="mt-2 text-sm font-semibold text-slate-950">
            60+ = Ready for promotion
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Inputs Considered</p>
          <p className="mt-2 text-sm leading-6 text-slate-700">
            {trials.length} belt trial submission{trials.length === 1 ? "" : "s"} and subdomain Journey inputs.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <span className="rounded-full border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-600">
              Vision tree: {visionNodeCount} goal node{visionNodeCount === 1 ? "" : "s"}
            </span>
            <span className="rounded-full border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-600">
              Roadmap waves: {roadmapWaveCount}
            </span>
            {evidenceCounts.map((item) => (
              <span key={item.domain} className="rounded-full border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-600">
                {item.domain}: {item.count}
              </span>
            ))}
          </div>
        </div>
      </div>

      {scores && Object.keys(scores).length > 0 && (
        <div className="mt-4">
          <AssessmentScores scores={scores} />
        </div>
      )}

      <div className="mt-4 rounded-lg border border-slate-200">
        <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Subdomain Grade Breakdown</p>
        </div>
        <div className="divide-y divide-slate-200">
          {subdomainRows.map((row) => (
            <div key={`${row.domain}-${row.subdomain}`} className="grid gap-3 p-4 lg:grid-cols-[220px_90px_1fr]">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{row.domain}</p>
                <p className="mt-1 text-sm font-semibold text-slate-950">{row.subdomain}</p>
              </div>
              <div>
                <span
                  className="inline-flex rounded-full px-2 py-1 text-xs font-semibold"
                  style={{ background: heatmapColor(row.score), color: heatmapTextColor(row.score) }}
                >
                  {row.score}/5
                </span>
                {row.status && <p className="mt-2 text-xs capitalize text-slate-500">{row.status}</p>}
              </div>
              <div className="space-y-2 text-sm leading-6 text-slate-700">
                {row.currentReadiness && <p><span className="font-semibold text-slate-950">Readiness of work: </span>{row.currentReadiness}</p>}
                {row.why && <p><span className="font-semibold text-slate-950">Why: </span>{row.why}</p>}
                {row.improve?.length > 0 && (
                  <p><span className="font-semibold text-slate-950">Improve: </span>{row.improve.join(" ")}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {visionTree.length > 0 && (
        <div className="mt-4 rounded-lg border border-slate-200">
          <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Vision Tree Considered</p>
          </div>
          <div className="divide-y divide-slate-200">
            {visionTree.map((vision) => (
              <div key={vision.id} className="p-4">
                <p className="text-sm font-semibold text-slate-950">{vision.title || "Untitled vision"}</p>
                <p className="mt-1 text-sm leading-6 text-slate-700">{compactText(vision.goal_text, 320)}</p>
                <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-slate-600">
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1">
                    {countGoalTreeNodes(vision.children || [])} child goal{countGoalTreeNodes(vision.children || []) === 1 ? "" : "s"}
                  </span>
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1">
                    {(vision.roadmap_waves || []).length} roadmap wave{(vision.roadmap_waves || []).length === 1 ? "" : "s"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 rounded-lg border border-slate-200">
        <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Trial Inputs Considered</p>
        </div>
        {trials.length > 0 ? (
          <div className="divide-y divide-slate-200">
            {trials.map((trial) => (
              <div key={trial.id || `${trial.dimension_id}-${trial.trial_type}`} className="p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      {domainNameFromId(trial.dimension_id)} / {String(trial.trial_type || "").replaceAll("_", " ")}
                    </p>
                    <p className="mt-1 text-sm font-semibold text-slate-950">{compactText(trial.prompt, 180)}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className="w-fit rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold capitalize text-slate-600">
                      {String(trial.status || "unknown").replaceAll("_", " ")}
                    </span>
                    {wheelScores?.[domainNameFromId(trial.dimension_id)]?.domain_score && (
                      <span className="w-fit rounded-full border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-600">
                        Domain grade: {wheelScores[domainNameFromId(trial.dimension_id)].domain_score}/5
                      </span>
                    )}
                  </div>
                </div>
                {trial.response_text && (
                  <p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm leading-6 text-slate-700">
                    {compactText(trial.response_text, 520)}
                  </p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="p-4 text-sm leading-6 text-slate-600">No belt trial submissions were stored in this assessment snapshot.</p>
        )}
      </div>
    </details>
  );
}

function AssessmentFeedback({ title, feedback }) {
  if (!feedback || Object.keys(feedback).length === 0) return null;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{title}</p>
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {Object.entries(feedback).map(([name, value]) => (
          <article key={name} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <h3 className="text-sm font-semibold text-slate-950">{name}</h3>
            {typeof value === "string" ? (
              <p className="mt-2 text-sm leading-6 text-slate-600">{value}</p>
            ) : (
              <div className="mt-2 space-y-2 text-sm leading-6 text-slate-600">
                {Object.entries(value || {}).map(([field, detail]) => (
                  <p key={field}>
                    <span className="font-semibold capitalize text-slate-800">{field.replaceAll("_", " ")}: </span>
                    {Array.isArray(detail) ? detail.join(", ") : String(detail || "")}
                  </p>
                ))}
              </div>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}

function LeadershipWheel({ selectedDimensionId, activeTopic, dimensionStates, topicData, journeyBelt, onSelectDimension, onSelectSubdomain, onSelectCenter }) {
  const anglePerDim = 360 / DIMENSIONS.length;
  const haloBelt = journeyBelt || getBeltById("white");

  return (
    <svg viewBox="0 0 1000 1000" className="h-auto w-full">
      <defs>
        <filter id="momentum-glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="8" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <g onClick={onSelectCenter} style={{ cursor: onSelectCenter ? "pointer" : "default" }}>
        <circle cx={CENTER.x} cy={CENTER.y} r={R_CENTER} fill="#101827" />
        <text x={CENTER.x} y={CENTER.y - 24} textAnchor="middle" fill="white" fontSize="27" fontWeight="700" pointerEvents="none">
          Leadership
        </text>
        <text x={CENTER.x} y={CENTER.y + 8} textAnchor="middle" fill="#d9c8a6" fontSize="23" fontWeight="600" pointerEvents="none">
          Operating
        </text>
        <text x={CENTER.x} y={CENTER.y + 39} textAnchor="middle" fill="#d9c8a6" fontSize="23" fontWeight="600" pointerEvents="none">
          System
        </text>
      </g>

      {DIMENSIONS.map((dimension, index) => {
        const start = index * anglePerDim;
        const end = (index + 1) * anglePerDim;
        const mid = start + anglePerDim / 2;
        const dimensionState = dimensionStates[dimension.id];
        const belt = getBelt(dimensionState.beltIndex);
        const isSelected = selectedDimensionId === dimension.id;
        const labelPos = polar(CENTER.x, CENTER.y, (R_CENTER + R_DOMAIN) / 2 + 4, mid);
        const subdomainAngle = anglePerDim / dimension.topics.length;

        return (
          <g key={dimension.id}>
            <path
              d={wedgePath(R_CENTER, R_DOMAIN, start, end)}
              fill={belt.color}
              stroke={isSelected ? "#0f172a" : "#ffffff"}
              strokeWidth={isSelected ? 8 : 4}
              filter={dimensionState.momentum ? "url(#momentum-glow)" : undefined}
              opacity={isSelected ? 1 : 0.92}
              onClick={() => onSelectDimension(dimension.id)}
              style={{ cursor: "pointer" }}
            />
            <text
              x={labelPos.x}
              y={labelPos.y - 8}
              textAnchor="middle"
              fill={belt.text}
              fontSize="16"
              fontWeight="700"
              pointerEvents="none"
            >
              {splitLabel(dimension.name, 11).map((part, partIndex) => (
                <tspan key={part} x={labelPos.x} dy={partIndex === 0 ? 0 : 19}>
                  {part}
                </tspan>
              ))}
            </text>

            {dimension.topics.map((topic, topicIndex) => {
              const topicStart = start + topicIndex * subdomainAngle;
              const topicEnd = topicStart + subdomainAngle;
              const topicMid = topicStart + subdomainAngle / 2;
              const topicItems = getTopicItems(topic, topicData);
              const hasEvidence = topicItems.length > 0;
              const isActiveTopic = isSelected && activeTopic === topic.label;
              const topicPos = polar(CENTER.x, CENTER.y, (R_DOMAIN + R_SUBDOMAIN) / 2, topicMid);

              return (
                <g key={topic.id}>
                  <path
                    d={wedgePath(R_DOMAIN, R_SUBDOMAIN, topicStart, topicEnd)}
                    fill={isActiveTopic ? "#0f172a" : isSelected ? "#1f2937" : hasEvidence ? "#f8fafc" : "#ffffff"}
                    stroke={isActiveTopic ? belt.color : "#d8d3c6"}
                    strokeWidth={isActiveTopic ? "5" : "3"}
                    onClick={() => onSelectSubdomain(dimension.id, topic)}
                    style={{ cursor: "pointer" }}
                  />
                  <path
                    d={arcPath(R_BELT, topicStart + 2, topicEnd - 2)}
                    fill="none"
                    stroke={haloBelt.color}
                    strokeWidth="12"
                    strokeLinecap="butt"
                    pointerEvents="none"
                  />
                  <text
                    x={topicPos.x}
                    y={topicPos.y - 12}
                    textAnchor="middle"
                    fill={isSelected ? "#ffffff" : "#334155"}
                    fontSize="13"
                    fontWeight={hasEvidence ? "700" : "600"}
                    pointerEvents="none"
                  >
                    {splitLabel(topic.label, 12).slice(0, 3).map((part, partLineIndex) => (
                      <tspan key={part} x={topicPos.x} dy={partLineIndex === 0 ? 0 : 17}>
                        {part}
                      </tspan>
                    ))}
                  </text>
                </g>
              );
            })}
          </g>
        );
      })}
    </svg>
  );
}

function DimensionDeepDive({ dimension, dimensionState, belt, nextBelt, latestAssessment }) {
  const assessment = latestAssessment ? directAssessmentCopy(latestAssessment) : null;
  const profile = assessment?.leadership_profile || {};
  const headline = profile.headline || "Your leadership style is still emerging";
  const description = profile.description || dimensionState.assessment;
  const strengths = profile.likely_strengths || [];
  const risks = profile.likely_risks || [];

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            Leadership Style Summary
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-slate-950">{headline}</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">{description}</p>
        </div>

        <div className="grid min-w-[260px] grid-cols-2 overflow-hidden rounded-lg border border-slate-200">
          <div className="bg-slate-50 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Current</p>
            <p className="mt-1 font-semibold" style={{ color: belt.color }}>
              {belt.name}
            </p>
            <p className="text-xs text-slate-500">{belt.meaning}</p>
          </div>
          <div className="bg-white p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Next</p>
            <p className="mt-1 font-semibold" style={{ color: nextBelt.color }}>
              {nextBelt.name}
            </p>
            <p className="text-xs text-slate-500">{nextBelt.meaning}</p>
          </div>
        </div>
      </div>

      <div className="mt-5 space-y-4">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Pattern Alfred Sees
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Likely strengths</p>
              <ul className="mt-2 space-y-1 text-sm leading-6 text-slate-700">
                {(strengths.length ? strengths : ["Complete your assessment to populate this."]).slice(0, 3).map((item, index) => (
                  <li key={`style-strength-${index}`}>{item}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Likely risks</p>
              <ul className="mt-2 space-y-1 text-sm leading-6 text-slate-700">
                {(risks.length ? risks : ["Complete your assessment to populate this."]).slice(0, 3).map((item, index) => (
                  <li key={`style-risk-${index}`}>{item}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
        <div className="rounded-lg border border-[#ded7c8] bg-[#fbfaf7] p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#7c4a2d]">
            Growth Edge
          </p>
          <p className="text-sm leading-6 text-slate-700">
            {profile.current_growth_edge || assessment?.alfred_coaching_note || "Complete a belt assessment to unlock a sharper leadership-style summary."}
          </p>
        </div>
      </div>
    </div>
  );
}

function formatTrialStatus(status) {
  const labels = {
    not_started: "Not Started",
    in_progress: "In Progress",
    submitted: "Submitted",
    needs_revision: "Needs Revision",
    needs_deeper_reflection: "Needs Deeper Reflection",
    passed: "Passed",
  };
  return labels[status] || "Not Started";
}

function normalizeRequirements(requirements, dimensionId) {
  const fallback = FALLBACK_YELLOW_BELT_REQUIREMENTS[dimensionId] || FALLBACK_YELLOW_BELT_REQUIREMENTS.execute;

  return {
    ...requirements,
    reflection: requirements?.reflection || fallback.reflection,
    real_world: requirements?.real_world || fallback.real_world,
    behavioral: requirements?.behavioral || fallback.behavioral,
    story: requirements?.story || {
      title: "",
      theme: "",
      full_story: "",
      leadership_lesson: "",
      key_message: "",
      belt_purpose: "",
      lessons: [],
      discussion_question: "",
    },
  };
}

function getFirstSentence(value) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  const match = text.match(/^.*?[.!?](?:\s|$)/);
  return (match ? match[0] : text).trim();
}

function BeltStepSummary({ dimension, targetBelt, requirements }) {
  const stepGuide = BELT_GUIDE.find((guide) => guide.id === targetBelt?.id) || BELT_GUIDE[0];
  const purpose = getFirstSentence(requirements?.criteria) || stepGuide.description;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
        Purpose of This Step
      </p>
      <h3 className="mt-2 text-xl font-semibold text-slate-950">
        {targetBelt.name} in {dimension.name}
      </h3>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{purpose}</p>
    </div>
  );
}

function PathToNextBeltPanel({ dimension, currentBelt, targetBelt, nextBelt, requirements, trialRecords, realWorldStatus, realWorldProgressDetail, behavioralStatus, behavioralProgressDetail, savingTrial, onStartTrial }) {
  const safeTargetBelt = targetBelt || getBeltById("yellow");
  const safeNextBelt = nextBelt || getBeltById(getNextBeltId(safeTargetBelt.id));
  const safeRequirements = normalizeRequirements(requirements, dimension.id);
  const reflectionTrial = getStoredTrial(trialRecords, dimension.id, safeTargetBelt.id, "reflection");
  const realWorldTrial = getStoredTrial(trialRecords, dimension.id, safeTargetBelt.id, "real_world");
  const currentBeltIndex = getBeltIndexById(currentBelt?.id);
  const targetBeltIndex = getBeltIndexById(safeTargetBelt.id);
  const isViewingCurrentBelt = currentBeltIndex === targetBeltIndex;
  const isViewingPastBelt = targetBeltIndex < currentBeltIndex;
  const isViewingFutureBelt = targetBeltIndex > currentBeltIndex;
  const getReflectionButtonLabel = () => {
    if (isViewingCurrentBelt) {
      if (normalizeStatus(reflectionTrial?.status) === "needs_revision") return "Resubmit";
      return reflectionTrial ? "Continue Reflection" : "Start Reflection";
    }
    if (isViewingPastBelt && reflectionTrial) return "Review Reflection";
    return null;
  };
  const getRealWorldButtonLabel = () => {
    if (isViewingCurrentBelt) {
      if (normalizeStatus(realWorldTrial?.status) === "needs_revision") return "Resubmit";
      return realWorldTrial ? "Log Trial" : "Start Trial";
    }
    if (isViewingPastBelt && realWorldTrial) return "Review Trial";
    return null;
  };
  const trialState = {
    reflection: {
      fallbackTitle: "Reflection Trial",
      status: formatTrialStatus(reflectionTrial?.status),
      feedback: reflectionTrial?.ai_feedback,
      score: getLatestTrialScore(reflectionTrial),
      buttonLabel: getReflectionButtonLabel(),
      onClick: () => onStartTrial("reflection", safeRequirements.reflection.prompt),
    },
    real_world: {
      fallbackTitle: "Real-World Trial",
      status: formatTrialStatus(realWorldStatus),
      statusDetail: normalizeStatus(realWorldStatus) !== "not_started" ? realWorldProgressDetail : null,
      feedback: realWorldTrial?.ai_feedback,
      score: getLatestTrialScore(realWorldTrial),
      buttonLabel: getRealWorldButtonLabel(),
      onClick: () => onStartTrial("real_world", safeRequirements.real_world.prompt),
    },
    behavioral: {
      fallbackTitle: "Behavioral Evidence",
      status: formatTrialStatus(behavioralStatus),
      statusDetail: normalizeStatus(behavioralStatus) !== "not_started" ? behavioralProgressDetail : null,
    },
  };
  const activeCards = getActiveTrialTypes(safeRequirements).map((trialType, index) => {
    const requirement = safeRequirements[trialType] || {};
    const state = trialState[trialType] || {};
    return {
      key: trialType,
      number: String(index + 1),
      title: requirement.title || state.fallbackTitle,
      body: requirement.prompt,
      footer: requirement.completion_hint,
      status: state.status,
      statusDetail: state.statusDetail,
      feedback: state.feedback,
      score: state.score,
      buttonLabel: state.buttonLabel,
      onClick: state.onClick,
    };
  });

  return (
    <div className="rounded-lg border border-amber-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-700">
            {safeTargetBelt.name} Trials
          </p>
          <h3 className="mt-1 text-xl font-semibold text-slate-950">
            What Alfred needs to see in {dimension.name}
          </h3>
          {!isViewingCurrentBelt && (
            <p className="mt-1 text-xs font-semibold text-slate-500">
              {isViewingFutureBelt ? "Previewing future requirements" : "Reviewing earlier requirements"}
            </p>
          )}
        </div>
        <span className="rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">
          {isViewingPastBelt ? "Earlier belt work" : isViewingFutureBelt ? "Future belt work" : `Earn ${safeNextBelt.name}`}
        </span>
      </div>

      <div className={`grid gap-3 ${activeCards.length >= 3 ? "lg:grid-cols-3" : "lg:grid-cols-2"}`}>
        {activeCards.map((card) => (
          <RequirementCard
            key={card.key}
            number={card.number}
            title={card.title}
            body={card.body}
            footer={card.footer}
            status={card.status}
            statusDetail={card.statusDetail}
            feedback={card.feedback}
            score={card.score}
            buttonLabel={card.buttonLabel}
            disabled={savingTrial}
            onClick={card.onClick}
          />
        ))}
      </div>
    </div>
  );
}

function LeadershipStoryCard({ story }) {
  const hasStory = hasText(story?.title) || hasText(story?.full_story);
  const lessons = Array.isArray(story?.lessons) ? story.lessons.filter(hasText) : [];
  const fullStory = String(story?.full_story || "");

  if (!hasStory) return null;

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
        Leadership Story
      </p>
      {hasText(story?.title) && (
        <h3 className="mt-2 text-xl font-semibold text-slate-950">{story.title}</h3>
      )}
      {hasText(story?.theme) && (
        <p className="mt-1 text-sm font-semibold text-slate-600">Theme: {story.theme}</p>
      )}
      {hasText(fullStory) && (
        <p className="mt-4 whitespace-pre-line text-sm leading-6 text-slate-700">
          {fullStory}
        </p>
      )}
      {lessons.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-600">
            Key Lessons
          </p>
          <ul className="mt-2 space-y-1 text-sm leading-6 text-slate-700">
            {lessons.map((lesson) => (
              <li key={lesson} className="flex gap-2">
                <span aria-hidden="true">-</span>
                <span>{lesson}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}

function RequirementCard({ number, title, body, footer, status, statusDetail, feedback, score, buttonLabel, disabled, onClick }) {
  return (
    <article className="rounded-lg border border-slate-200 bg-[#fbfaf7] p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-500 text-sm font-semibold text-white">
          {number}
        </span>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-sm font-semibold text-slate-950">{title}</h4>
            {status && <StatusPill status={status} detail={statusDetail} />}
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-700">{body}</p>
          <p className="mt-4 border-t border-slate-200 pt-3 text-xs leading-5 text-slate-500">
            {footer}
          </p>
          {feedback && (
            <div className={`mt-4 rounded-lg border p-3 ${status === "Passed" ? "border-green-200 bg-green-50" : "border-amber-200 bg-amber-50"}`}>
              <div className="flex flex-wrap items-center gap-2">
                <p className={`text-xs font-semibold uppercase tracking-[0.14em] ${status === "Passed" ? "text-green-700" : "text-amber-800"}`}>
                  Alfred Feedback
                </p>
                {score ? (
                  <span className="rounded-full border border-white/70 bg-white/70 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                    {score}/5
                  </span>
                ) : null}
              </div>
              <p className="mt-2 text-xs leading-5 text-slate-700">{feedback}</p>
            </div>
          )}
          {buttonLabel && (
            <button
              type="button"
              disabled={disabled}
              onClick={onClick}
              className="mt-4 rounded-md bg-slate-950 px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {buttonLabel}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

function TrialModal({ trial, draft, setDraft, saving, error, onClose, onSave, onSubmit }) {
  const isReflection = trial.trial_type === "reflection";
  const targetBelt = getBeltById(trial.target_belt || "yellow");
  const title = isReflection ? "Reflection Trial" : "Real-World Trial";
  const helperText = isReflection
    ? "Write honestly. Alfred will review depth, ownership, and pattern recognition as soon as you submit."
    : "Log what you tried, what happened, what you noticed emotionally, and what you would change next time.";
  const isRevision = normalizeStatus(trial.status) === "needs_revision";
  const feedbackHistory = Array.isArray(trial.evidence?.feedback_history) ? trial.evidence.feedback_history : [];
  const latestReview = getLatestTrialReview(trial);
  const reviewScore = getLatestTrialScore(trial);
  const attemptNumber = latestReview.attempt_number || feedbackHistory.length || null;
  const reviewedAt = trial.reviewed_at || feedbackHistory[feedbackHistory.length - 1]?.reviewed_at;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
      <div className="w-full max-w-3xl overflow-hidden rounded-lg bg-white shadow-2xl">
        <div className="border-b border-slate-200 px-6 py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-700">
                Path to {targetBelt.name}
              </p>
              <h3 className="mt-1 text-xl font-semibold text-slate-950">{title}</h3>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-2 py-1 text-xl leading-none text-slate-500 hover:bg-slate-100 hover:text-slate-800"
              aria-label="Close exercise"
            >
              x
            </button>
          </div>
        </div>

        <div className="px-6 py-5">
          <div className="rounded-lg border border-[#ded7c8] bg-[#fbfaf7] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7c4a2d]">
              Prompt
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-800">{trial.prompt}</p>
          </div>

          <label className="mt-5 block text-sm font-semibold text-slate-800" htmlFor="belt-trial-response">
            Your response
          </label>
          <textarea
            id="belt-trial-response"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={10}
            className="mt-2 w-full resize-y rounded-lg border border-slate-300 px-4 py-3 text-sm leading-6 outline-none focus:border-slate-700 focus:ring-2 focus:ring-slate-200"
            placeholder={isReflection ? "Start with what happened, then what it revealed..." : "Describe the action, the outcome, and what you learned..."}
          />
          <p className="mt-2 text-xs leading-5 text-slate-500">{helperText}</p>
          {trial.ai_feedback && (
            <div className={`mt-4 rounded-lg border p-4 ${isRevision ? "border-amber-200 bg-amber-50" : "border-green-200 bg-green-50"}`}>
              <div className="flex flex-wrap items-center gap-2">
                <p className={`text-xs font-semibold uppercase tracking-[0.16em] ${isRevision ? "text-amber-800" : "text-green-700"}`}>
                  Alfred Feedback
                </p>
                {reviewScore ? (
                  <span className="rounded-full border border-white/70 bg-white/70 px-2 py-0.5 text-xs font-semibold text-slate-700">
                    {reviewScore}/5
                  </span>
                ) : null}
              </div>
              {(attemptNumber || reviewedAt || trial.status) && (
                <p className="mt-2 text-xs font-semibold text-slate-500">
                  {attemptNumber ? `Attempt ${attemptNumber}` : "Latest review"}
                  {reviewedAt ? ` · Reviewed ${formatDateTime(reviewedAt)}` : ""}
                  {trial.status ? ` · ${formatTrialStatus(trial.status)}` : ""}
                </p>
              )}
              <p className="mt-2 text-sm leading-6 text-slate-700">{trial.ai_feedback}</p>
            </div>
          )}
          {error && (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm leading-6 text-red-700">
              {typeof error === "string" ? error : "Alfred could not save this exercise yet. Your text is still on screen; please try again."}
            </div>
          )}
        </div>

        <div className="flex flex-col-reverse gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4 sm:flex-row sm:justify-end">
          <button
            type="button"
            disabled={saving || !draft.trim()}
            onClick={onSave}
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
          >
            Save for Later
          </button>
          <button
            type="button"
            disabled={saving || !draft.trim()}
            onClick={onSubmit}
            className="rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {saving ? "Alfred is reviewing..." : isRevision ? "Resubmit" : "Submit Exercise"}
          </button>
        </div>
      </div>
    </div>
  );
}

function TelemetryPanel({ telemetry, loading }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Behavioral Telemetry</p>
      <h3 className="mt-1 text-xl font-semibold text-slate-950">Alfred as the Training Ground</h3>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {telemetry.map((signal) => (
          <div key={signal.label} className="rounded-lg border border-slate-200 p-4">
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-slate-800">{signal.label}</p>
              <span className="text-sm font-semibold text-slate-950">{loading ? "--" : `${signal.value}%`}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-[#2f855a] transition-all duration-500"
                style={{ width: `${loading ? 0 : signal.value}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-slate-500">{signal.detail}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function TopicEvidencePanel({ dimension, activeTopic, setActiveTopic, items, promptConfig, onNavigate, onAddItem, onEditItem }) {
  const activeTopicConfig = dimension.topics.find((topic) => topic.label === activeTopic) || dimension.topics[0];
  const subdomainQuestion = getSubdomainQuestion(promptConfig, activeTopicConfig);
  const redirect = REDIRECT_TOPICS[activeTopicConfig.id];

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Evidence Library</p>
          <h3 className="mt-1 text-xl font-semibold text-slate-950">{activeTopicConfig.label} Inputs</h3>
          <p className="mt-2 text-sm leading-6 text-slate-600">{subdomainQuestion}</p>
        </div>
        <div className="flex flex-col gap-2 sm:items-end">
          <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-1">
            {dimension.topics.map((topic) => (
              <button
                key={topic.id}
                type="button"
                onClick={() => setActiveTopic(topic.label)}
                className={`rounded-md px-3 py-2 text-xs font-semibold transition ${
                  activeTopicConfig.id === topic.id ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-white"
                }`}
              >
                {topic.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => onAddItem(activeTopicConfig)}
            className="rounded-md bg-slate-950 px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-800"
          >
            {redirect?.label || `Add ${activeTopicConfig.label}`}
          </button>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {items.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-5 text-sm leading-6 text-slate-600">
            No {activeTopic.toLowerCase()} evidence has been captured yet. Alfred can still guide the trial,
            but Journey feedback becomes more useful as your examples get more concrete.
          </div>
        ) : (
          items.slice(0, 5).map((item) => (
            <EvidenceItem
              key={item.id}
              item={item}
              collapsible={COLLAPSIBLE_EVIDENCE_TOPICS.has(activeTopicConfig.id)}
              onClick={() => {
                if (redirect && onNavigate) {
                  onNavigate(redirect.page);
                  return;
                }
                onEditItem(activeTopicConfig, item);
              }}
            />
          ))
        )}
      </div>
    </div>
  );
}

function EvidenceItem({ item, collapsible, onClick }) {
  const [expanded, setExpanded] = useState(false);
  const title = getItemTitle(item);
  const body = getItemBody(item);
  const shouldCollapse = collapsible && body && body.trim().length > 120;

  return (
    <article
      className="cursor-pointer rounded-lg border border-slate-200 bg-slate-50 p-4 transition hover:border-slate-300 hover:bg-white hover:shadow-sm"
      onClick={onClick}
    >
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      {body && (
        <p
          className="mt-2 text-sm leading-6 text-slate-600"
          style={shouldCollapse && !expanded ? {
            display: "-webkit-box",
            WebkitLineClamp: 1,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          } : undefined}
        >
          {body}
        </p>
      )}
      {shouldCollapse && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            setExpanded((current) => !current);
          }}
          className="mt-2 text-xs font-semibold text-slate-700 underline-offset-2 hover:underline"
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </article>
  );
}

function SubdomainItemModal({ topic, item, promptConfig, values = [], saving, onClose, onSave, onDelete }) {
  const fields = TOPIC_FORM_FIELDS[topic.label] || [];
  const [formData, setFormData] = useState(() => fields.reduce((data, field) => {
    if (data[field.name] === undefined && field.defaultValue !== undefined) {
      data[field.name] = field.defaultValue;
    }
    return data;
  }, { ...(item || {}), value_ids: Array.isArray(item?.value_ids) ? item.value_ids : [] }));
  const isVisionTopic = topic?.id === "vision";
  const titleField = TOPICS_REQUIRING_TITLES.has(topic.id)
    ? fields.find((field) => field.name === "title")
    : null;
  const primaryField = fields.find((field) => field.required && field.type !== "hidden") ||
    fields.find((field) => field.type === "textarea") ||
    fields.find((field) => field.type !== "hidden");
  const subdomainQuestion = getSubdomainQuestion(promptConfig, topic);

  const handleChange = (fieldName, value) => {
    setFormData((current) => ({ ...current, [fieldName]: value }));
  };

  const toggleValue = (valueId) => {
    setFormData((current) => {
      const currentIds = current.value_ids || [];
      const nextIds = currentIds.includes(valueId)
        ? currentIds.filter((id) => id !== valueId)
        : [...currentIds, valueId];
      return { ...current, value_ids: nextIds };
    });
  };

  const handleSubmit = () => {
    if (titleField && !hasText(formData.title)) {
      alert("Please add a short title.");
      return;
    }

    if (primaryField?.required && !String(formData[primaryField.name] || "").trim()) {
      alert("Please answer the question before saving.");
      return;
    }

    const payload = fields.reduce((data, field) => {
      const value = formData[field.name];
      if (value !== undefined) data[field.name] = value;
      return data;
    }, {});

    if (isVisionTopic) {
      payload.value_ids = formData.value_ids || [];
    }

    onSave(payload);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
      <div className="w-full max-w-2xl overflow-hidden rounded-lg bg-white shadow-2xl">
        <div className="border-b border-slate-200 px-6 py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                Journey Subdomain
              </p>
              <h3 className="mt-1 text-xl font-semibold text-slate-950">
                {item?.id ? "Edit" : "Add"} {topic.label}
              </h3>
              {subdomainQuestion && <p className="mt-2 text-sm leading-6 text-slate-600">{subdomainQuestion}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-2 py-1 text-xl leading-none text-slate-500 hover:bg-slate-100 hover:text-slate-800"
              aria-label="Close subdomain item"
            >
              x
            </button>
          </div>
        </div>

        <div className="max-h-[65vh] overflow-y-auto px-6 py-5">
          {titleField && (
            <label className="mb-4 block">
              <span className="text-sm font-semibold text-slate-800">Title</span>
              <input
                type="text"
                value={formData.title || ""}
                maxLength={20}
                onChange={(event) => handleChange("title", event.target.value.slice(0, 20))}
                className="mt-2 w-full rounded-lg border border-slate-300 px-4 py-3 text-sm outline-none focus:border-slate-700 focus:ring-2 focus:ring-slate-200"
              />
              <p className="mt-1 text-xs text-slate-500">{String(formData.title || "").length}/20</p>
            </label>
          )}
          {primaryField && (
            <label className="block">
              <span className="text-sm font-semibold text-slate-800">Your answer</span>
              <textarea
                value={formData[primaryField.name] || ""}
                onChange={(event) => handleChange(primaryField.name, event.target.value)}
                rows={8}
                className="mt-2 w-full resize-y rounded-lg border border-slate-300 px-4 py-3 text-sm leading-6 outline-none focus:border-slate-700 focus:ring-2 focus:ring-slate-200"
              />
            </label>
          )}
          {isVisionTopic && (
            <div className="mt-5">
              <span className="text-sm font-semibold text-slate-800">Associated Values</span>
              {values.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {values.map((value) => {
                    const selected = (formData.value_ids || []).includes(value.id);
                    return (
                      <button
                        key={value.id}
                        type="button"
                        onClick={() => toggleValue(value.id)}
                        className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                          selected
                            ? "border-blue-500 bg-blue-50 text-blue-700"
                            : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                        }`}
                      >
                        {value.title || value.value_text}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="mt-2 text-sm text-slate-500">Add values first, then link them to this vision.</p>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-col-reverse gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4 sm:flex-row sm:justify-end">
          {item?.id && (
            <button
              type="button"
              disabled={saving}
              onClick={onDelete}
              className="rounded-md border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Delete
            </button>
          )}
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={handleSubmit}
            className="rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {item?.id ? "Save Changes" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}

function StatusPill({ status, detail }) {
  const styles = {
    Passed: "border-green-200 bg-green-50 text-green-700",
    Submitted: "border-blue-200 bg-blue-50 text-blue-700",
    "Needs Revision": "border-amber-200 bg-amber-50 text-amber-800",
    "Needs Deeper Reflection": "border-amber-200 bg-amber-50 text-amber-800",
    "In Progress": "border-amber-200 bg-amber-50 text-amber-700",
    "Needs Evidence": "border-slate-200 bg-slate-100 text-slate-700",
    "Not Started": "border-slate-200 bg-white text-slate-500",
  };

  return (
    <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${styles[status] || styles["Not Started"]}`}>
      {detail ? `${status} ${detail}` : status}
    </span>
  );
}
