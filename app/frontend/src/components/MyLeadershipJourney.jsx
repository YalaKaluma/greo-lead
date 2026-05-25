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
      { id: "prioritization", label: "Prioritization", endpoint: "execution-systems", filter: (item) => item.category === "prioritization" },
      { id: "execution_system", label: "Execution System", endpoint: "execution-systems" },
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
  const [selectedDimensionId, setSelectedDimensionId] = useState("execute");
  const [signals, setSignals] = useState({
    goals: [],
    executionSystems: [],
    procrastination: [],
    goalReviews: [],
  });
  const [topicData, setTopicData] = useState({});
  const [loadingSignals, setLoadingSignals] = useState(false);
  const [activeTopic, setActiveTopic] = useState("Execution System");
  const [trialRecords, setTrialRecords] = useState([]);
  const [trialConfig, setTrialConfig] = useState(null);
  const [subdomainPromptConfig, setSubdomainPromptConfig] = useState(null);
  const [selectedTrialBeltId, setSelectedTrialBeltId] = useState(null);
  const [activeTrial, setActiveTrial] = useState(null);
  const [trialDraft, setTrialDraft] = useState("");
  const [savingTrial, setSavingTrial] = useState(false);
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
  const selectedBelt = getBelt(selectedState.beltIndex);
  const activeBelt = getBeltById(selectedState.activeBeltId);
  const viewedBelt = getBeltById(selectedTrialBeltId || selectedState.activeBeltId);
  const viewedNextBelt = getBeltById(getNextBeltId(viewedBelt.id));
  const activeNextBelt = getBeltById(selectedState.nextBeltId);
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
      existing ||
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

          <div className="flex flex-wrap gap-2">
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

        <div className="grid gap-6 xl:grid-cols-[520px_minmax(0,1fr)]">
          <section className="space-y-5">
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <LeadershipWheel
                selectedDimensionId={selectedDimensionId}
                activeTopic={activeTopic}
                dimensionStates={dimensionStates}
                topicData={topicData}
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
              belt={selectedBelt}
              nextBelt={activeNextBelt}
              telemetry={telemetry}
              loadingSignals={loadingSignals}
            />

            <PathToNextBeltPanel
              dimension={selectedDimension}
              currentBelt={activeBelt}
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
      </div>

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

function LeadershipWheel({ selectedDimensionId, activeTopic, dimensionStates, topicData, onSelectDimension, onSelectSubdomain }) {
  const anglePerDim = 360 / DIMENSIONS.length;

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
                    stroke={belt.color}
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

function DimensionDeepDive({ dimension, dimensionState, belt, nextBelt, telemetry, loadingSignals }) {
  const integrationAverage = dimension.mvp ? getTelemetryAverage(telemetry) : null;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            Dimension Deep Dive
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-slate-950">{dimension.name}</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">{dimension.brief}</p>
          <p className="mt-3 inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
            {dimensionState.evidenceLabel}
          </p>
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

      <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
        <div className="rounded-lg border border-[#ded7c8] bg-[#fbfaf7] p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#7c4a2d]">
            Alfred Leadership Assessment
          </p>
          <p className="text-sm leading-6 text-slate-700">{dimensionState.assessment}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-950 p-4 text-white">
          <p className="text-xs uppercase tracking-wide text-slate-300">Integration Readiness</p>
          <p className="mt-3 text-4xl font-semibold">
            {loadingSignals || integrationAverage === null ? "--" : `${integrationAverage}%`}
          </p>
          <p className="mt-2 text-xs leading-5 text-slate-300">
            {dimension.mvp
              ? "Behavioral evidence from Alfred usage. Advancement is recommended when the pattern holds."
              : "Behavioral scoring for this dimension is not connected yet."}
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
            but maturity scoring becomes more trustworthy as real usage accumulates.
          </div>
        ) : (
          items.slice(0, 5).map((item) => (
            <EvidenceItem
              key={item.id}
              item={item}
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

function EvidenceItem({ item, onClick }) {
  const title = getItemTitle(item);
  const body = getItemBody(item);

  return (
    <article
      className="cursor-pointer rounded-lg border border-slate-200 bg-slate-50 p-4 transition hover:border-slate-300 hover:bg-white hover:shadow-sm"
      onClick={onClick}
    >
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      {body && <p className="mt-2 text-sm leading-6 text-slate-600">{body}</p>}
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
