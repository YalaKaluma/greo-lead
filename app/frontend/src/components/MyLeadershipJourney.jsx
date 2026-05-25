import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";

const CENTER = { x: 500, y: 500 };
const R_CENTER = 116;
const R_DOMAIN = 240;
const R_SUBDOMAIN = 380;
const R_BELT = 412;

const BELTS = [
  { id: "white", name: "White Belt", shortName: "White", meaning: "Awareness", color: "#F8FAFC", text: "#111827" },
  { id: "yellow", name: "Yellow Belt", shortName: "Yellow", meaning: "Understanding", color: "#FACC15", text: "#111827" },
  { id: "green", name: "Green Belt", shortName: "Green", meaning: "Application", color: "#22C55E", text: "#ffffff" },
  { id: "brown", name: "Brown Belt", shortName: "Brown", meaning: "Integration", color: "#92400E", text: "#ffffff" },
  { id: "black", name: "Black Belt", shortName: "Black", meaning: "Transmission", color: "#111827", text: "#ffffff" },
];

const BELT_IDS = BELTS.map((belt) => belt.id);

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

function getBeltById(beltId) {
  return BELTS.find((belt) => belt.id === beltId) || BELTS[0];
}

function getBeltIndexById(beltId) {
  return Math.max(0, BELTS.findIndex((belt) => belt.id === beltId));
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

function getActiveTrialTypes(requirements) {
  return ["reflection", "real_world", "behavioral"].filter((trialType) =>
    isRequirementActive(requirements?.[trialType])
  );
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
  if (filledCount === dimension.topics.length) return "submitted";
  if (filledCount > 0) return "in_progress";
  return "not_started";
}

function getBehavioralStatus(dimensionId, targetBeltId, trialRecords, telemetryAverage, topicData) {
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

function getTargetBeltProgress(dimensionId, targetBeltId, trialRecords, telemetryAverage, trialConfig, topicData) {
  const requirements = getBeltRequirementsFromConfig(trialConfig, dimensionId, targetBeltId);
  const activeTrialTypes = getActiveTrialTypes(normalizeRequirements(requirements, dimensionId));
  const reflection = getStoredTrial(trialRecords, dimensionId, targetBeltId, "reflection");
  const realWorld = getStoredTrial(trialRecords, dimensionId, targetBeltId, "real_world");
  const behavioralStatus = getBehavioralStatus(dimensionId, targetBeltId, trialRecords, telemetryAverage, topicData);
  const statuses = {
    reflection: reflection?.status,
    real_world: realWorld?.status,
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

function getDimensionProgression(dimensionId, trialRecords, telemetryAverage, trialConfig, topicData) {
  let currentBeltId = "white";
  let activeBeltId = "white";
  let nextBeltId = "yellow";

  for (const beltId of BELT_IDS) {
    const progress = getTargetBeltProgress(dimensionId, beltId, trialRecords, telemetryAverage, trialConfig, topicData);
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

  const activeProgress = getTargetBeltProgress(dimensionId, activeBeltId, trialRecords, telemetryAverage, trialConfig, topicData);

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

function buildDimensionStates(telemetry, trialRecords, trialConfig, topicData) {
  const telemetryAverage = getTelemetryAverage(telemetry);

  return DIMENSIONS.reduce((states, dimension) => {
    const progression = getDimensionProgression(dimension.id, trialRecords, telemetryAverage, trialConfig, topicData);
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

export default function MyLeadershipJourney({ apiUrl, userNumber, onNavigate }) {
  const [activeJourneyTab, setActiveJourneyTab] = useState("journey");
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
  const [trialConfig, setTrialConfig] = useState(null);
  const [subdomainPromptConfig, setSubdomainPromptConfig] = useState(null);
  const [selectedTrialBeltId, setSelectedTrialBeltId] = useState(null);
  const [activeTrial, setActiveTrial] = useState(null);
  const [trialDraft, setTrialDraft] = useState("");
  const [savingTrial, setSavingTrial] = useState(false);
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
    () => buildDimensionStates(telemetry, trialRecords, trialConfig, topicData),
    [telemetry, trialRecords, trialConfig, topicData]
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
    setSelectedTrialBeltId(null);
    if (nextDimension?.topics?.length) {
      setActiveTopic(nextDimension.topics[0].label);
    }
  };

  const handleSelectSubdomain = (dimensionId, topic) => {
    setSelectedDimensionId(dimensionId);
    setSelectedTrialBeltId(null);
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
  const journeyCurrentBelt = getBeltById(readinessStatus?.current_belt || latestAssessment?.target_belt || selectedState.currentBeltId);
  const journeyNextBelt = getBeltById(readinessStatus?.target_belt || getNextBeltId(journeyCurrentBelt.id));
  const viewedBelt = getBeltById(selectedTrialBeltId || journeyCurrentBelt.id);
  const viewedNextBelt = getBeltById(getNextBeltId(viewedBelt.id));
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
    topicData
  );

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
  };

  const saveTrialResponse = async (status) => {
    if (!activeTrial || !trialDraft.trim()) return;

    setSavingTrial(true);
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
      setTrialRecords((current) =>
        current.some((trial) => trial.id === updatedTrial.id)
          ? current.map((trial) => (trial.id === updatedTrial.id ? updatedTrial : trial))
          : [updatedTrial, ...current]
      );
      setActiveTrial(null);
      setTrialDraft("");
    } catch (error) {
      console.error("Failed to submit belt trial", error);
      alert("Alfred could not save this exercise yet. Your text is still on screen; please try again.");
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
    <div className="min-h-full bg-[#f6f5f1] px-4 py-5 text-slate-900 md:px-10 md:py-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
              Leadership Journey 2.0
            </p>
            <h1 className="text-3xl font-semibold text-slate-950 md:text-4xl">
              Leadership Operating System
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 md:text-base">
              The wheel is now your living map: belt progression, reflection, real-world trials,
              and behavioral evidence from how you use Alfred.
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:items-end">
            {readinessStatus?.is_eligible_to_submit ? (
              <button
                type="button"
                onClick={() => setShowAssessmentConfirm(true)}
                className="rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
              >
                Submit for Belt Assessment
              </button>
            ) : readinessStatus?.required_trials ? (
              <p className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm">
                {Math.max((readinessStatus.required_trials || 0) - (readinessStatus.completed_trials || 0), 0)} trials remaining before {journeyNextBelt.name} assessment
              </p>
            ) : null}
            <div className="flex flex-wrap justify-end gap-2">
              {BELTS.map((belt) => (
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
          </div>
        </div>

        <div className="mb-5 flex flex-wrap gap-2 rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
          <button
            type="button"
            onClick={() => setActiveJourneyTab("journey")}
            className={`rounded-md px-4 py-2 text-sm font-semibold transition ${
              activeJourneyTab === "journey" ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            Journey Map
          </button>
          {(latestAssessment || assessmentHistory.length > 0 || activeJourneyTab === "assessment") && (
            <button
              type="button"
              onClick={() => setActiveJourneyTab("assessment")}
              className={`rounded-md px-4 py-2 text-sm font-semibold transition ${
                activeJourneyTab === "assessment" ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              Belt Assessment
            </button>
          )}
        </div>

        {activeJourneyTab === "assessment" ? (
          <BeltAssessmentTab
            readinessStatus={readinessStatus}
            latestAssessment={latestAssessment}
            assessmentHistory={assessmentHistory}
            acceptingPromotion={acceptingPromotion}
            error={assessmentError}
            onSubmit={() => setShowAssessmentConfirm(true)}
            onAcceptPromotion={handleAcceptPromotion}
          />
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
            <DimensionDeepDive
              dimension={selectedDimension}
              dimensionState={selectedState}
              belt={journeyCurrentBelt}
              nextBelt={journeyNextBelt}
              latestAssessment={latestAssessment}
            />

            <PathToNextBeltPanel
              dimension={selectedDimension}
              currentBelt={journeyCurrentBelt}
              targetBelt={viewedBelt}
              nextBelt={viewedNextBelt}
              requirements={viewedBeltRequirements}
              trialRecords={trialRecords}
              topicData={topicData}
              behavioralStatus={viewedBehavioralStatus}
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

      {activeTrial && (
        <TrialModal
          trial={activeTrial}
          draft={trialDraft}
          setDraft={setTrialDraft}
          saving={savingTrial}
          onClose={() => {
            setActiveTrial(null);
            setTrialDraft("");
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

function LeadershipWheel({ selectedDimensionId, activeTopic, dimensionStates, topicData, journeyBelt, onSelectDimension, onSelectSubdomain }) {
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

      <circle cx={CENTER.x} cy={CENTER.y} r={R_CENTER} fill="#101827" />
      <text x={CENTER.x} y={CENTER.y - 18} textAnchor="middle" fill="white" fontSize="34" fontWeight="700">
        Alfred
      </text>
      <text x={CENTER.x} y={CENTER.y + 18} textAnchor="middle" fill="#d9c8a6" fontSize="20" fontWeight="500">
        Leadership
      </text>
      <text x={CENTER.x} y={CENTER.y + 45} textAnchor="middle" fill="#d9c8a6" fontSize="20" fontWeight="500">
        Dojo
      </text>

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
    needs_deeper_reflection: "Needs Deeper Reflection",
    passed: "Passed",
  };
  return labels[status] || "Not Started";
}

function normalizeRequirements(requirements, dimensionId) {
  const fallback = FALLBACK_YELLOW_BELT_REQUIREMENTS[dimensionId] || FALLBACK_YELLOW_BELT_REQUIREMENTS.execute;

  return {
    reflection: requirements?.reflection || fallback.reflection,
    real_world: requirements?.real_world || fallback.real_world,
    behavioral: requirements?.behavioral || fallback.behavioral,
  };
}

function PathToNextBeltPanel({ dimension, currentBelt, targetBelt, nextBelt, requirements, trialRecords, behavioralStatus, savingTrial, onStartTrial }) {
  const safeTargetBelt = targetBelt || getBeltById("yellow");
  const safeNextBelt = nextBelt || getBeltById(getNextBeltId(safeTargetBelt.id));
  const safeRequirements = normalizeRequirements(requirements, dimension.id);
  const reflectionTrial = getStoredTrial(trialRecords, dimension.id, safeTargetBelt.id, "reflection");
  const realWorldTrial = getStoredTrial(trialRecords, dimension.id, safeTargetBelt.id, "real_world");
  const isViewingCurrentBelt = currentBelt?.id === safeTargetBelt.id;
  const activeCards = [
    isRequirementActive(safeRequirements.reflection) && {
      title: safeRequirements.reflection.title || "Reflection Trial",
      body: safeRequirements.reflection.prompt,
      footer: safeRequirements.reflection.completion_hint,
      status: formatTrialStatus(reflectionTrial?.status),
      buttonLabel: isViewingCurrentBelt ? (reflectionTrial ? "Continue Reflection" : "Start Reflection") : null,
      onClick: () => onStartTrial("reflection", safeRequirements.reflection.prompt),
    },
    isRequirementActive(safeRequirements.real_world) && {
      title: safeRequirements.real_world.title || "Real-World Trial",
      body: safeRequirements.real_world.prompt,
      footer: safeRequirements.real_world.completion_hint,
      status: formatTrialStatus(realWorldTrial?.status),
      buttonLabel: isViewingCurrentBelt ? (realWorldTrial ? "Log Trial" : "Start Trial") : null,
      onClick: () => onStartTrial("real_world", safeRequirements.real_world.prompt),
    },
    isRequirementActive(safeRequirements.behavioral) && {
      title: safeRequirements.behavioral.title || "Behavioral Evidence",
      body: safeRequirements.behavioral.prompt,
      footer: safeRequirements.behavioral.completion_hint,
      status: formatTrialStatus(behavioralStatus),
    },
  ].filter(Boolean).map((card, index) => ({ ...card, number: String(index + 1) }));

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
              Previewing future requirements
            </p>
          )}
        </div>
        <span className="rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">
          Earn {safeNextBelt.name}
        </span>
      </div>

      <div className={`grid gap-3 ${activeCards.length >= 3 ? "lg:grid-cols-3" : "lg:grid-cols-2"}`}>
        {activeCards.map((card) => (
          <RequirementCard
            key={card.title}
            number={card.number}
            title={card.title}
            body={card.body}
            footer={card.footer}
            status={card.status}
            buttonLabel={card.buttonLabel}
            disabled={savingTrial}
            onClick={card.onClick}
          />
        ))}
      </div>
    </div>
  );
}

function RequirementCard({ number, title, body, footer, status, buttonLabel, disabled, onClick }) {
  return (
    <article className="rounded-lg border border-slate-200 bg-[#fbfaf7] p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-500 text-sm font-semibold text-white">
          {number}
        </span>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-sm font-semibold text-slate-950">{title}</h4>
            {status && <StatusPill status={status} />}
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-700">{body}</p>
          <p className="mt-4 border-t border-slate-200 pt-3 text-xs leading-5 text-slate-500">
            {footer}
          </p>
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

function TrialModal({ trial, draft, setDraft, saving, onClose, onSave, onSubmit }) {
  const isReflection = trial.trial_type === "reflection";
  const targetBelt = getBeltById(trial.target_belt || "yellow");
  const title = isReflection ? "Reflection Trial" : "Real-World Trial";
  const helperText = isReflection
    ? "Write honestly. Alfred will eventually evaluate depth, ownership, and pattern recognition, not polish."
    : "Log what you tried, what happened, what you noticed emotionally, and what you would change next time.";

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
            Submit Exercise
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

function SubdomainItemModal({ topic, item, promptConfig, saving, onClose, onSave, onDelete }) {
  const [formData, setFormData] = useState(item || {});
  const fields = TOPIC_FORM_FIELDS[topic.label] || [];
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

function StatusPill({ status }) {
  const styles = {
    Passed: "border-green-200 bg-green-50 text-green-700",
    Submitted: "border-blue-200 bg-blue-50 text-blue-700",
    "In Progress": "border-amber-200 bg-amber-50 text-amber-700",
    "Needs Evidence": "border-slate-200 bg-slate-100 text-slate-700",
    "Not Started": "border-slate-200 bg-white text-slate-500",
  };

  return (
    <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${styles[status] || styles["Not Started"]}`}>
      {status}
    </span>
  );
}
