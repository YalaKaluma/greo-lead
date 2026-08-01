import React, { useEffect, useState } from "react";
import axios from "axios";
import MyCoachingSessions from "../MyCoachingSessions";
import {
  BELT_GUIDE,
  DIMENSIONS,
  LEADERSHIP_ARC,
  LEADERSHIP_QUADRANT_LABELS,
  RECOMMENDATION_LABELS,
  WHY_IT_MATTERS,
  getBeltById,
  getBeltIndexById
} from "./journeyModel";
import { directAssessmentCopy, formatDateTime } from "./journeyAssessment";
import { StatusPill } from "./journeyEvidence";
import { formatTrialStatus } from "./journeyTrials";
import { LeadershipWheel } from "./journeyWheel";

export function JourneyHeaderTabs({
  t,
  isAssessmentLockedUntilYellow,
  readinessStatus,
  journeyNextBelt,
  currentBelt,
  beltLegend,
  viewedBelt,
  activeJourneyTab,
  setActiveJourneyTab,
  setSelectedTrialBeltId,
  setShowAssessmentConfirm,
  setShowBeltGuide,
}) {
  return (
    <>
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
              {beltLegend.map((belt) => {
                const isLocked = getBeltIndexById(belt.id) > getBeltIndexById(currentBelt?.id);

                return (
                  <button
                    key={belt.name}
                    type="button"
                    disabled={isLocked}
                    onClick={() => setSelectedTrialBeltId(belt.id)}
                    aria-label={`${belt.name}${isLocked ? " locked" : ""}`}
                    title={isLocked ? `Earn ${belt.name} to unlock its lessons and trials` : `View ${belt.name} work`}
                    className={`flex items-center gap-2 rounded-full border px-3 py-2 text-xs shadow-sm transition ${
                      viewedBelt.id === belt.id
                        ? "border-slate-950 bg-slate-950 text-white"
                        : isLocked
                          ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400 opacity-60"
                          : "border-slate-200 bg-white text-slate-700 hover:border-slate-400"
                    }`}
                  >
                    <span
                      className={`h-3 w-3 rounded-full border ${isLocked ? "border-slate-300 grayscale" : "border-slate-300"}`}
                      style={{ backgroundColor: belt.color }}
                    />
                    <span>{belt.shortName}</span>
                    {isLocked && <span className="sr-only">Locked</span>}
                  </button>
                );
              })}
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
          <button
            type="button"
            onClick={() => setActiveJourneyTab("story")}
            className={`relative px-2 pb-3 font-medium transition-colors ${
              activeJourneyTab === "story" ? "text-blue-600" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            My Story
            {activeJourneyTab === "story" && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />
            )}
          </button>
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
            onClick={() => setActiveJourneyTab("trends")}
            className={`relative px-2 pb-3 font-medium transition-colors ${
              activeJourneyTab === "trends" ? "text-blue-600" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            Leadership Trends
            {activeJourneyTab === "trends" && (
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
    </>
  );
}

export function JourneyProgressReviewTab({
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

export function LeadershipCoachingSessionsTab({ apiUrl, userNumber }) {
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

export function LeadershipWheelModal({ dimensionStates, topicData, journeyBelt, onClose }) {
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

export function BeltGuideModal({ currentBelt, onClose }) {
  const currentBeltIndex = getBeltIndexById(currentBelt?.id);
  const availableGuide = BELT_GUIDE.filter(
    (guide) => getBeltIndexById(guide.id) <= currentBeltIndex
  );
  const availableArc = LEADERSHIP_ARC.slice(0, availableGuide.length);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-3 md:p-6">
      <div className="flex max-h-[92vh] w-full max-w-7xl flex-col overflow-hidden rounded-lg bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 md:px-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Belt Progression</p>
            <h3 className="mt-1 text-2xl font-semibold text-slate-950">Leadership Is Not a Destination</h3>
            <div className="mt-2 max-w-3xl space-y-2 text-sm leading-6 text-slate-600">
              <p>Leadership is not something you achieve once.</p>
              <p>
                It is a lifelong journey of becoming more aware, more intentional, and more capable of helping others
                grow.
              </p>
            </div>
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
          <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
            {availableGuide.map((guide) => {
              const belt = getBeltById(guide.earnedBeltId || guide.id);

              return (
                <article key={guide.id} className="flex min-h-[560px] flex-col rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
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
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{guide.focusIntro}</p>
                    <ul className="mt-2 grid gap-1.5 text-sm leading-6 text-slate-700 sm:grid-cols-2">
                      {guide.focus.map((item) => (
                        <li key={item} className="flex gap-2">
                          <span className="mt-2 h-1.5 w-1.5 flex-none rounded-full bg-slate-400" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <p className="mt-4 text-sm leading-6 text-slate-700">{guide.closing}</p>

                  <div className="mt-auto rounded-md border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Objective</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">{guide.objective}</p>
                    <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Key Question</p>
                    <p className="mt-1 text-sm leading-6 text-slate-700">{guide.keyQuestion}</p>
                  </div>
                </article>
              );
            })}
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
            <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm md:p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">The Leadership Arc</p>
              <div className="mt-4 overflow-hidden rounded-md border border-slate-200">
                {availableArc.map((row, index) => (
                  <div
                    key={row.belt}
                    className={`grid grid-cols-[minmax(120px,0.8fr)_1fr] gap-4 px-4 py-3 text-sm ${
                      index === 0 ? "" : "border-t border-slate-200"
                    }`}
                  >
                    <p className="font-semibold text-slate-900">{row.belt}</p>
                    <p className="text-slate-700">{row.focus}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm md:p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">A Note on Mastery</p>
              <div className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
                <p>There is no final destination.</p>
                <p>The purpose of the Leadership Operating System is not to earn a belt.</p>
                <p>
                  It is to continually deepen your awareness, strengthen your operating system, and help others grow
                  through the lessons you have earned.
                </p>
              </div>
            </section>
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

export function BeltAssessmentConfirmModal({ readinessStatus, submitting, error, onClose, onSubmit }) {
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
