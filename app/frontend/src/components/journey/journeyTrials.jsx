import React from "react";
import {
  BELT_DOMAIN_PURPOSES,
  BELT_GUIDE,
  FALLBACK_YELLOW_BELT_REQUIREMENTS,
  TRIAL_TYPES,
  getActiveTrialTypes,
  getBeltById,
  getBeltIndexById,
  getLatestTrialReview,
  getLatestTrialScore,
  getNextBeltId,
  getStoredTrial,
  hasText,
  isRequirementActive,
  normalizeStatus
} from "./journeyModel";
import { formatDateTime } from "./journeyAssessment";
import { StatusPill } from "./journeyEvidence";

export function formatTrialStatus(status) {
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

export function BeltStepSummary({ dimension, targetBelt, requirements }) {
  const stepGuide = BELT_GUIDE.find((guide) => guide.id === targetBelt?.id) || BELT_GUIDE[0];
  const purposeCopy = BELT_DOMAIN_PURPOSES[targetBelt?.id]?.[dimension?.id];
  const purpose = purposeCopy?.purpose || getFirstSentence(requirements?.criteria) || stepGuide.description;
  const whyItMatters = purposeCopy?.why || "This step turns the idea into focused practice before you move on.";

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
        Purpose of This Step
      </p>
      <h3 className="mt-2 text-xl font-semibold text-slate-950">{purpose}</h3>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{whyItMatters}</p>
    </div>
  );
}

export function PathToNextBeltPanel({ dimension, currentBelt, targetBelt, nextBelt, requirements, trialRecords, realWorldStatus, realWorldProgressDetail, behavioralStatus, behavioralProgressDetail, savingTrial, onStartTrial, onNavigate }) {
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
      return realWorldTrial ? "Continue Response" : "Submit Response";
    }
    if (isViewingPastBelt) return realWorldTrial ? "Review Response" : "Submit Response";
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
    const canShareInGrowthJournal =
      safeTargetBelt.id === "yellow" &&
      ["energy", "learning"].includes(dimension.id) &&
      ["real_world", "behavioral"].includes(trialType) &&
      typeof onNavigate === "function";
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
      secondaryButtonLabel: canShareInGrowthJournal ? "Share in Growth Journal" : null,
      onSecondaryClick: canShareInGrowthJournal ? () => onNavigate("my-journal") : null,
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
            secondaryButtonLabel={card.secondaryButtonLabel}
            disabled={savingTrial}
            onClick={card.onClick}
            onSecondaryClick={card.onSecondaryClick}
          />
        ))}
      </div>
    </div>
  );
}

export function LeadershipStoryCard({ story }) {
  const hasStory = hasText(story?.title) || hasText(story?.full_story);
  const lessons = Array.isArray(story?.lessons) ? story.lessons.filter(hasText) : [];
  const fullStory = String(story?.full_story || "");
  const hasImage = hasText(story?.image_src);
  const imageSrc = resolveStoryImageSrc(story?.image_src);
  const tagline = String(story?.tagline || "").trim();

  if (!hasStory) return null;

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
        Leadership Story
      </p>
      {hasText(story?.title) && (
        <h3 className="mt-2 text-xl font-semibold text-slate-950">
          {story.title}
        </h3>
      )}
      {hasText(story?.theme) && (
        <p className="mt-1 text-sm font-semibold text-slate-600">Theme: {story.theme}</p>
      )}
      {hasImage && (
        <figure className="mt-4 overflow-hidden rounded-md border border-slate-200 bg-slate-50">
          <img
            src={imageSrc}
            alt={story.image_alt || story.title || "Leadership story image"}
            className="h-auto w-full object-contain"
          />
          {tagline && (
            <figcaption className="border-t border-slate-200 bg-white px-4 py-3 text-center text-base font-semibold leading-6 text-slate-950">
              {tagline}
            </figcaption>
          )}
        </figure>
      )}
      {(hasText(fullStory) || lessons.length > 0) && (
        <details className="group mt-4">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-100">
            <span>{hasImage ? "Read full story" : "Full story"}</span>
            <span className="text-slate-500 transition-transform group-open:rotate-180" aria-hidden="true">
              v
            </span>
          </summary>
          <div className="pt-4">
            {hasText(fullStory) && (
              <p className="whitespace-pre-line text-sm leading-6 text-slate-700">
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
          </div>
        </details>
      )}
    </article>
  );
}

function resolveStoryImageSrc(src) {
  const value = String(src || "").trim();
  if (!value) return "";
  if (/^(https?:|data:|blob:)/i.test(value)) return value;
  return value.replace(/^\/+/, "");
}

export function RequirementCard({ number, title, body, footer, status, statusDetail, feedback, score, buttonLabel, secondaryButtonLabel, disabled, onClick, onSecondaryClick }) {
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
          {(buttonLabel || secondaryButtonLabel) && (
            <div className="mt-4 flex flex-wrap gap-2">
          {buttonLabel && (
            <button
              type="button"
              disabled={disabled}
              onClick={onClick}
              className="rounded-md bg-slate-950 px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {buttonLabel}
            </button>
          )}
          {secondaryButtonLabel && (
            <button
              type="button"
              disabled={disabled}
              onClick={onSecondaryClick}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {secondaryButtonLabel}
            </button>
          )}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

export function TrialModal({ trial, draft, setDraft, saving, error, onClose, onSave, onSubmit }) {
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

export function TelemetryPanel({ telemetry, loading }) {
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
