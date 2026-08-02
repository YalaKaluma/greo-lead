import React from "react";
import { DIMENSIONS, HEATMAP_COLORS, HEATMAP_TEXT } from "./journeyModel";

function heatmapColor(score) {
  const value = Math.max(1, Math.min(5, Number(score) || 1));
  return HEATMAP_COLORS[value] || "#E5E7EB";
}

function heatmapTextColor(score) {
  const value = Math.max(1, Math.min(5, Number(score) || 1));
  return HEATMAP_TEXT[value] || "#111827";
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

export function DevelopmentalScoringAccordion({ assessment, wheelScores, scores }) {
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

export function AssessmentFeedback({ title, feedback }) {
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

export function DimensionDeepDive({ dimension, dimensionState, belt, nextBelt, assessment }) {
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
