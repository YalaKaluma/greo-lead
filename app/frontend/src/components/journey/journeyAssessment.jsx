import React, { useState } from "react";
import {
  CENTER,
  DIMENSIONS,
  HEATMAP_COLORS,
  HEATMAP_TEXT,
  R_CENTER,
  R_DOMAIN,
  R_SUBDOMAIN,
  RECOMMENDATION_LABELS,
  WHY_IT_MATTERS,
  getBeltById,
  polar,
  splitLabel,
  wedgePath
} from "./journeyModel";
import { StatusPill } from "./journeyEvidence";
import {
  AssessmentFeedback,
  DevelopmentalScoringAccordion,
  DimensionDeepDive,
} from "./journeyAssessmentDetails";

export function MyLeadershipTab({ dimension, dimensionState, currentBelt, nextBelt, latestAssessment }) {
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

export function formatDateTime(value) {
  if (!value) return "Not submitted yet";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

export function directAssessmentCopy(value) {
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

export function normalizeAssessmentWheel(assessment) {
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

export function firstHeatmapSelection(wheelScores) {
  for (const dimension of DIMENSIONS) {
    const subdomainName = dimension.topics[0]?.label;
    const feedback = wheelScores?.[dimension.name]?.subdomains?.[subdomainName];
    if (feedback) {
      return { domain: dimension.name, subdomain: subdomainName, feedback };
    }
  }
  return null;
}

export function BeltAssessmentTab({ readinessStatus, latestAssessment, assessmentHistory, acceptingPromotion, error, onSubmit, onAcceptPromotion }) {
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

export function LeadershipProfileSection({ profile }) {
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
