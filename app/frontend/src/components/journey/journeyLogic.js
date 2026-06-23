import {
  BELTS,
  BELT_IDS,
  CENTER,
  DIMENSIONS,
  R_BELT,
  TOPIC_FORM_FIELDS,
  WHY_IT_MATTERS
} from "./journeyData";

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
  if (signal?.signal === "ten_tasks_created" || signal?.signal === "tasks_consistently_entered" || signal?.signal === "tasks_maintained") return "tasks";
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
    "ten_tasks_created",
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

function normalizeRequirements(requirements, dimensionId) {
  const fallback = FALLBACK_YELLOW_BELT_REQUIREMENTS[dimensionId] || FALLBACK_YELLOW_BELT_REQUIREMENTS.execute;
  const sourceRequirements = requirements || fallback;
  const hasTrialPrompts = TRIAL_TYPES.some((trialType) => hasText(sourceRequirements?.[trialType]));
  const evidenceSignals = Array.isArray(sourceRequirements?.evidence_signals) ? sourceRequirements.evidence_signals : [];

  return {
    criteria: sourceRequirements?.criteria || fallback.criteria,
    evidence: sourceRequirements?.evidence || fallback.evidence,
    reflection: sourceRequirements?.reflection || fallback.reflection,
    real_world: sourceRequirements?.real_world || fallback.real_world,
    behavioral: sourceRequirements?.behavioral || fallback.behavioral,
    evidence_signals: evidenceSignals,
    _hasTrialPrompts: hasTrialPrompts,
  };
}

export {
  getSubdomainQuestion,
  FALLBACK_YELLOW_BELT_REQUIREMENTS,
  polar,
  wedgePath,
  arcPath,
  splitLabel,
  getTopicItems,
  normalizeCategory,
  normalizeGoalLevel,
  getItemTitle,
  getItemBody,
  getBelt,
  normalizeBeltId,
  getBeltById,
  getBeltIndexById,
  getNextBeltId,
  inferStatus,
  getTelemetryAverage,
  normalizeStatus,
  isPassed,
  getStatusProgress,
  isStarted,
  hasText,
  isRequirementActive,
  TRIAL_TYPES,
  getActiveTrialTypes,
  getStoredTrial,
  getLatestTrialReview,
  getLatestTrialScore,
  getPrimaryFieldForTopic,
  hasFilledTopicEvidence,
  getWhiteBehavioralEvidenceStatus,
  getYellowValidationBehavioralStatus,
  getValidationForBelt,
  getDimensionValidation,
  getTrialTypeValidation,
  getSignalUnit,
  getSignalActual,
  getSignalRequired,
  isSignalComplete,
  formatSingleSignalProgress,
  getPrimaryProgressSignal,
  formatSignalProgressDetail,
  getTrialProgressDetail,
  getBehavioralStatus,
  getRealWorldStatus,
  getTargetBeltProgress,
  getDimensionProgression,
  buildDimensionStates,
  getBeltRequirementsFromConfig,
  beltHasActiveTrialContent,
  normalizeRequirements
};
