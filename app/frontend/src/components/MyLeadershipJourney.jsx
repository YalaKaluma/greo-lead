import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";

const CENTER = { x: 500, y: 500 };
const R_CENTER = 116;
const R_INNER = 220;
const R_OUTER = 360;

const BELTS = [
  { name: "White Belt", shortName: "White", meaning: "Awareness", color: "#e5e7eb", text: "#111827" },
  { name: "Yellow Belt", shortName: "Yellow", meaning: "Understanding", color: "#d6a11d", text: "#111827" },
  { name: "Green Belt", shortName: "Green", meaning: "Application", color: "#2f855a", text: "#ffffff" },
  { name: "Brown Belt", shortName: "Brown", meaning: "Integration", color: "#7c4a2d", text: "#ffffff" },
  { name: "Black Belt", shortName: "Black", meaning: "Transmission", color: "#111827", text: "#ffffff" },
];

const DIMENSIONS = [
  {
    id: "vision",
    name: "Vision & Goals",
    brief: "Purpose, values, alignment, and long-term direction.",
    topics: ["Values", "Strengths", "Goals"],
  },
  {
    id: "people",
    name: "People",
    brief: "Communication, delegation, inspiration, and trust.",
    topics: ["Team Composition", "Inspire", "Coach & Delegate"],
  },
  {
    id: "execute",
    name: "Prioritize & Execute",
    brief: "Focus, discipline, prioritization, and delivery.",
    topics: ["Prioritization", "Execution System", "Procrastination"],
    mvp: true,
  },
  {
    id: "energy",
    name: "Time & Energy",
    brief: "Recovery, capacity, energy management, and sustainability.",
    topics: ["Energy Sources", "Energy Drains", "Recovery"],
  },
  {
    id: "learning",
    name: "Learning & Development",
    brief: "Growth, resilience, reflection, and continuous improvement.",
    topics: ["Failures & Scars", "Development Opportunities", "Development Plan"],
  },
];

const TOPIC_ENDPOINTS = {
  Values: "values",
  Strengths: "strengths",
  Goals: "goals",
  "Team Composition": "team-composition",
  Inspire: "inspiration",
  "Coach & Delegate": "coaching-moments",
  Prioritization: "execution-systems",
  "Execution System": "execution-systems",
  Procrastination: "procrastination-patterns",
  "Energy Sources": "energy-sources",
  "Energy Drains": "energy-drains",
  Recovery: "recovery-methods",
  "Failures & Scars": "failures",
  "Development Opportunities": "development-areas",
  "Development Plan": "execution-systems",
};

const EXECUTE_TRIALS = [
  {
    id: "reflection",
    type: "Reflection Trial",
    status: "Not Started",
    prompt: "How does stress affect execution, focus, and follow-through?",
    evidence:
      "No scored reflection trial is stored yet. This should only pass after Alfred evaluates depth, ownership, and pattern recognition.",
  },
  {
    id: "world",
    type: "Real-World Trial",
    status: "Not Started",
    prompt: "Plan your top 3 priorities daily for one full workweek.",
    evidence:
      "No real-world trial submission is stored yet. The future flow should capture what happened, what was hard, and what changed.",
  },
  {
    id: "telemetry",
    type: "Behavioral Integration Trial",
    status: "Not Started",
    prompt: "Use the prioritization system consistently and reduce overdue task drift.",
    evidence:
      "Signals are being read from task completion, MTN usage, overdue items, and linked execution reflections.",
  },
];

const FALLBACK_YELLOW_BELT_REQUIREMENTS = {
  vision: {
    reflection: {
      prompt: "Describe a goal that looks impressive on paper but may not be fully aligned with your values.",
      completion_hint: "Show self-awareness, ownership, and pattern recognition.",
    },
    real_world: {
      prompt: "Rewrite, retire, or clarify one goal so it better reflects what actually matters.",
      completion_hint: "Do one concrete action outside the app, then reflect on what happened.",
    },
    behavioral: {
      prompt: "Complete at least one weekly goal review and add alignment context to your active goals.",
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

function getBelt(beltIndex) {
  return BELTS[beltIndex] || BELTS[0];
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

function buildDimensionStates(telemetry) {
  const telemetryAverage = getTelemetryAverage(telemetry);
  const executeHasEvidence = telemetry.some((signal) => signal.value > 0);

  return DIMENSIONS.reduce((states, dimension) => {
    if (dimension.id !== "execute") {
      states[dimension.id] = {
        beltIndex: 0,
        progress: 0,
        momentum: false,
        assessment:
          "This dimension is mapped, but Alfred has not started scoring it yet. It should remain White Belt until reflection, real-world, and behavioral evidence are connected.",
        evidenceLabel: "Not yet scored",
      };
      return states;
    }

    states[dimension.id] = {
      beltIndex: 0,
      progress: telemetryAverage,
      momentum: telemetryAverage >= 55,
      assessment: executeHasEvidence
        ? "Alfred has early behavioral evidence for your execution system, but not enough completed trial evidence to award a higher belt. The current score should be treated as progress toward Yellow Belt, not as earned maturity."
        : "Alfred does not yet have enough behavioral evidence or completed trials to assess this dimension. You are at the starting point, which is exactly where an honest operating system should begin.",
      evidenceLabel: executeHasEvidence ? "Early telemetry only" : "No earned evidence yet",
    };

    return states;
  }, {});
}

export default function MyLeadershipJourney({ apiUrl, userNumber }) {
  const [selectedDimensionId, setSelectedDimensionId] = useState("execute");
  const [signals, setSignals] = useState({
    goals: [],
    executionSystems: [],
    procrastination: [],
    goalReviews: [],
  });
  const [loadingSignals, setLoadingSignals] = useState(false);
  const [activeTopic, setActiveTopic] = useState("Execution System");
  const [trialRecords, setTrialRecords] = useState([]);
  const [trialConfig, setTrialConfig] = useState(null);
  const [activeTrial, setActiveTrial] = useState(null);
  const [trialDraft, setTrialDraft] = useState("");
  const [savingTrial, setSavingTrial] = useState(false);

  const selectedDimension = useMemo(
    () => DIMENSIONS.find((dimension) => dimension.id === selectedDimensionId) || DIMENSIONS[2],
    [selectedDimensionId]
  );

  useEffect(() => {
    if (!apiUrl || !userNumber) return;

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

        if (cancelled) return;

        setSignals({
          goals: goals.status === "fulfilled" ? goals.value.data || [] : [],
          executionSystems: executionSystems.status === "fulfilled" ? executionSystems.value.data || [] : [],
          procrastination: procrastination.status === "fulfilled" ? procrastination.value.data || [] : [],
          goalReviews:
            goalReviews.status === "fulfilled"
              ? goalReviews.value.data?.sessions || goalReviews.value.data || []
              : [],
        });
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
    if (!apiUrl) return;

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
    if (!apiUrl || !userNumber) return;

    let cancelled = false;
    const fetchTrials = async () => {
      try {
        const response = await axios.get(`${apiUrl}/api/journey/belt-trials`, {
          params: { user_number: userNumber, target_belt: "yellow" },
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

  const dimensionStates = useMemo(() => buildDimensionStates(telemetry), [telemetry]);

  const topicItems = useMemo(() => {
    if (activeTopic === "Execution System") return signals.executionSystems;
    if (activeTopic === "Prioritization") {
      return signals.executionSystems.filter((item) => item.category === "prioritization");
    }
    if (activeTopic === "Procrastination") return signals.procrastination;
    return [];
  }, [activeTopic, signals]);

  const selectedState = dimensionStates[selectedDimension.id];
  const selectedBelt = getBelt(selectedState.beltIndex);
  const nextBelt = BELTS[Math.min(selectedState.beltIndex + 1, BELTS.length - 1)];
  const yellowBeltRequirements =
    trialConfig?.yellow_belt?.dimensions || FALLBACK_YELLOW_BELT_REQUIREMENTS;

  const handleStartTrial = async (trialType, prompt) => {
    const existing = trialRecords.find(
      (trial) =>
        trial.dimension_id === selectedDimension.id &&
        trial.target_belt === "yellow" &&
        trial.trial_type === trialType
    );

    const trial =
      existing ||
      {
        id: null,
        user_number: userNumber,
        dimension_id: selectedDimension.id,
        target_belt: "yellow",
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
              <div
                key={belt.name}
                className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 shadow-sm"
              >
                <span
                  className="h-3 w-3 rounded-full border border-slate-300"
                  style={{ backgroundColor: belt.color }}
                />
                <span>{belt.shortName}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[520px_minmax(0,1fr)]">
          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <LeadershipWheel
              selectedDimensionId={selectedDimensionId}
              dimensionStates={dimensionStates}
              onSelectDimension={setSelectedDimensionId}
            />
          </section>

          <section className="space-y-5">
            <DimensionDeepDive
              dimension={selectedDimension}
              dimensionState={selectedState}
              belt={selectedBelt}
              nextBelt={nextBelt}
              telemetry={telemetry}
              loadingSignals={loadingSignals}
            />

            {selectedDimension.mvp ? (
              <>
                <PathToYellowPanel
                  dimension={selectedDimension}
                  requirements={yellowBeltRequirements[selectedDimension.id]}
                  trialRecords={trialRecords}
                  savingTrial={savingTrial}
                  onStartTrial={handleStartTrial}
                />
                <TrialsPanel
                  telemetry={telemetry}
                  belt={selectedBelt}
                  nextBelt={nextBelt}
                  dimension={selectedDimension}
                  requirements={yellowBeltRequirements[selectedDimension.id]}
                  trialRecords={trialRecords}
                />
                <TelemetryPanel telemetry={telemetry} loading={loadingSignals} />
                <TopicEvidencePanel
                  activeTopic={activeTopic}
                  setActiveTopic={setActiveTopic}
                  items={topicItems}
                />
              </>
            ) : (
              <>
                <PathToYellowPanel
                  dimension={selectedDimension}
                  trialRecords={trialRecords}
                  savingTrial={savingTrial}
                  onStartTrial={handleStartTrial}
                />
                <ComingSoonPanel dimension={selectedDimension} />
              </>
            )}
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
    </div>
  );
}

function LeadershipWheel({ selectedDimensionId, dimensionStates, onSelectDimension }) {
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
        const labelPos = polar(CENTER.x, CENTER.y, (R_CENTER + R_INNER) / 2 + 6, mid);
        const topicPos = polar(CENTER.x, CENTER.y, (R_INNER + R_OUTER) / 2, mid);
        const progressEnd = start + (anglePerDim * dimensionState.progress) / 100;

        return (
          <g key={dimension.id}>
            <path
              d={wedgePath(R_CENTER, R_INNER, start, end)}
              fill={belt.color}
              stroke={isSelected ? "#0f172a" : "#ffffff"}
              strokeWidth={isSelected ? 8 : 4}
              filter={dimensionState.momentum ? "url(#momentum-glow)" : undefined}
              opacity={isSelected ? 1 : 0.92}
              onClick={() => onSelectDimension(dimension.id)}
              style={{ cursor: "pointer" }}
            />
            <path
              d={wedgePath(R_INNER, R_OUTER, start, end)}
              fill={isSelected ? "#1f2937" : "#f8fafc"}
              stroke="#d8d3c6"
              strokeWidth="3"
              onClick={() => onSelectDimension(dimension.id)}
              style={{ cursor: "pointer" }}
            />
            {dimensionState.progress > 0 && (
              <path
                d={arcPath(R_OUTER + 16, start + 3, progressEnd - 3)}
                fill="none"
                stroke={belt.color}
                strokeWidth="18"
                strokeLinecap="round"
              />
            )}
            <text
              x={labelPos.x}
              y={labelPos.y - 8}
              textAnchor="middle"
              fill={belt.text}
              fontSize="16"
              fontWeight="700"
              pointerEvents="none"
            >
              {dimension.name.split(" & ").map((part, partIndex) => (
                <tspan key={part} x={labelPos.x} dy={partIndex === 0 ? 0 : 19}>
                  {partIndex === 0 ? part : `& ${part}`}
                </tspan>
              ))}
            </text>
            <text
              x={topicPos.x}
              y={topicPos.y - 18}
              textAnchor="middle"
              fill={isSelected ? "#ffffff" : "#334155"}
              fontSize="14"
              fontWeight="600"
              pointerEvents="none"
            >
              <tspan x={topicPos.x}>{belt.shortName}</tspan>
              <tspan x={topicPos.x} dy="20">
                {dimensionState.progress}% to next
              </tspan>
              {dimensionState.momentum && (
                <tspan x={topicPos.x} dy="20" fill={isSelected ? "#f8e7bd" : "#7c4a2d"}>
                  Momentum active
                </tspan>
              )}
              {!dimensionState.momentum && dimensionState.evidenceLabel && (
                <tspan x={topicPos.x} dy="20" fill={isSelected ? "#d9c8a6" : "#64748b"}>
                  {dimensionState.evidenceLabel}
                </tspan>
              )}
            </text>
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

function getStoredTrial(trialRecords, dimensionId, trialType) {
  return trialRecords.find(
    (trial) =>
      trial.dimension_id === dimensionId &&
      trial.target_belt === "yellow" &&
      trial.trial_type === trialType
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

function PathToYellowPanel({ dimension, requirements, trialRecords, savingTrial, onStartTrial }) {
  const safeRequirements = requirements || FALLBACK_YELLOW_BELT_REQUIREMENTS[dimension.id];
  const reflectionTrial = getStoredTrial(trialRecords, dimension.id, "reflection");
  const realWorldTrial = getStoredTrial(trialRecords, dimension.id, "real_world");

  return (
    <div className="rounded-lg border border-amber-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-700">
            Path to Yellow Belt
          </p>
          <h3 className="mt-1 text-xl font-semibold text-slate-950">
            What Alfred needs to see in {dimension.name}
          </h3>
        </div>
        <span className="rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">
          Awareness to Understanding
        </span>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <RequirementCard
          number="1"
          title={safeRequirements.reflection.title || "Reflection Trial"}
          body={safeRequirements.reflection.prompt}
          footer={safeRequirements.reflection.completion_hint}
          status={formatTrialStatus(reflectionTrial?.status)}
          buttonLabel={reflectionTrial ? "Continue Reflection" : "Start Reflection"}
          disabled={savingTrial}
          onClick={() => onStartTrial("reflection", safeRequirements.reflection.prompt)}
        />
        <RequirementCard
          number="2"
          title={safeRequirements.real_world.title || "Real-World Trial"}
          body={safeRequirements.real_world.prompt}
          footer={safeRequirements.real_world.completion_hint}
          status={formatTrialStatus(realWorldTrial?.status)}
          buttonLabel={realWorldTrial ? "Log Trial" : "Start Trial"}
          disabled={savingTrial}
          onClick={() => onStartTrial("real_world", safeRequirements.real_world.prompt)}
        />
        <RequirementCard
          number="3"
          title={safeRequirements.behavioral.title || "Behavioral Evidence"}
          body={safeRequirements.behavioral.prompt}
          footer={safeRequirements.behavioral.completion_hint}
          status="Auto-tracked"
        />
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
                Path to Yellow Belt
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

function TrialsPanel({ telemetry, belt, nextBelt, dimension, trialRecords }) {
  const telemetryAverage = getTelemetryAverage(telemetry);
  const trials = EXECUTE_TRIALS.map((trial) => {
    if (trial.id === "telemetry") {
      return { ...trial, status: inferStatus(telemetryAverage) };
    }

    const storedTrial = getStoredTrial(
      trialRecords,
      dimension.id,
      trial.id === "world" ? "real_world" : trial.id
    );

    return storedTrial
      ? {
          ...trial,
          status: formatTrialStatus(storedTrial.status),
          evidence: storedTrial.response_text
            ? "Your submission is stored. Alfred grading is the next backend step before this can become a pass."
            : trial.evidence,
        }
      : trial;
  });

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Advancement Loop</p>
          <h3 className="mt-1 text-xl font-semibold text-slate-950">
            {belt.shortName} to {nextBelt.shortName} Belt Trials
          </h3>
        </div>
        <span className="rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">
          Alfred recommends, you decide
        </span>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        {trials.map((trial) => (
          <article key={trial.id} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-start justify-between gap-3">
              <h4 className="text-sm font-semibold text-slate-950">{trial.type}</h4>
              <StatusPill status={trial.status} />
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-700">{trial.prompt}</p>
            <p className="mt-4 border-t border-slate-200 pt-3 text-xs leading-5 text-slate-500">
              {trial.evidence}
            </p>
          </article>
        ))}
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

function TopicEvidencePanel({ activeTopic, setActiveTopic, items }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Evidence Library</p>
          <h3 className="mt-1 text-xl font-semibold text-slate-950">Prioritize & Execute Inputs</h3>
        </div>
        <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-1">
          {["Execution System", "Prioritization", "Procrastination"].map((topic) => (
            <button
              key={topic}
              type="button"
              onClick={() => setActiveTopic(topic)}
              className={`rounded-md px-3 py-2 text-xs font-semibold transition ${
                activeTopic === topic ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-white"
              }`}
            >
              {topic}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {items.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-5 text-sm leading-6 text-slate-600">
            No {activeTopic.toLowerCase()} evidence has been captured yet. Alfred can still guide the trial,
            but maturity scoring becomes more trustworthy as real usage accumulates.
          </div>
        ) : (
          items.slice(0, 5).map((item) => <EvidenceItem key={item.id} item={item} />)
        )}
      </div>
    </div>
  );
}

function EvidenceItem({ item }) {
  const title =
    item.title ||
    item.system_text ||
    item.pattern_text ||
    item.goal_text ||
    item.strength ||
    "Captured evidence";
  const body = item.effectiveness || item.strategy || item.underlying_reason || item.why || item.category;

  return (
    <article className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      {body && <p className="mt-2 text-sm leading-6 text-slate-600">{body}</p>}
    </article>
  );
}

function ComingSoonPanel({ dimension }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">MVP Scope</p>
      <h3 className="mt-1 text-xl font-semibold text-slate-950">{dimension.name} is mapped, not yet fully active</h3>
      <p className="mt-3 text-sm leading-6 text-slate-600">
        This dimension already has belt color, maturity language, and wheel navigation. The complete
        reflection, real-world, and behavioral integration loop is implemented first for Prioritize & Execute.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {dimension.topics.map((topic) => (
          <span key={topic} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-600">
            {topic}
          </span>
        ))}
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
