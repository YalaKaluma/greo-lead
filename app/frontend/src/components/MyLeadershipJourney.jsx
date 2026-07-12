import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useLanguage } from "../i18n/LanguageContext";
import {
  BELT_IDS,
  DIMENSIONS,
  REDIRECT_TOPICS,
  TOPIC_FORM_FIELDS,
  VISIBLE_BELTS,
  beltHasActiveTrialContent,
  buildDimensionStates,
  getBehavioralStatus,
  getBeltById,
  getBeltIndexById,
  getBeltRequirementsFromConfig,
  getNextBeltId,
  getRealWorldStatus,
  getStoredTrial,
  getTelemetryAverage,
  getTopicItems,
  getTrialProgressDetail,
  normalizeBeltId
} from "./journey/journeyModel";
import {
  BeltAssessmentConfirmModal,
  BeltAssessmentTab,
  BeltGuideModal,
  BeltStepSummary,
  JourneyHeaderTabs,
  JourneyProgressReviewTab,
  LeadershipCoachingSessionsTab,
  LeadershipStoryCard,
  LeadershipWheel,
  LeadershipWheelModal,
  MyLeadershipTab,
  PathToNextBeltPanel,
  SubdomainItemModal,
  TelemetryPanel,
  TopicEvidencePanel,
  TrialModal
} from "./journey/journeySections";

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
        const [whiteResponse, yellowResponse, greenResponse] = await Promise.allSettled(
          ["white", "yellow", "green"].map((belt) =>
            axios.get(`${apiUrl}/api/journey/validation/${belt}`, {
              params: { user_number: userNumber },
            })
          )
        );
        if (!cancelled) {
          setBeltValidations((current) => ({
            ...current,
            white: whiteResponse.status === "fulfilled" ? whiteResponse.value.data || null : current.white,
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
  const currentBeltIndex = getBeltIndexById(journeyCurrentBelt.id);
  const availableTrialBelts = VISIBLE_BELTS.filter(
    (belt) =>
      getBeltIndexById(belt.id) <= currentBeltIndex &&
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
  const canViewSelectedTrialBelt = availableTrialBelts.some(
    (belt) => belt.id === effectiveSelectedTrialBeltId
  );
  const viewedBelt = getBeltById(
    canViewSelectedTrialBelt ? effectiveSelectedTrialBeltId : journeyCurrentBelt.id
  );

  useEffect(() => {
    if (selectedTrialBeltId && !canViewSelectedTrialBelt) {
      setSelectedTrialBeltId(null);
    }
  }, [selectedTrialBeltId, canViewSelectedTrialBelt]);
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
        <JourneyHeaderTabs
          t={t}
          isAssessmentLockedUntilYellow={isAssessmentLockedUntilYellow}
          readinessStatus={readinessStatus}
          journeyNextBelt={journeyNextBelt}
          availableTrialBelts={availableTrialBelts}
          viewedBelt={viewedBelt}
          activeJourneyTab={activeJourneyTab}
          setActiveJourneyTab={setActiveJourneyTab}
          setSelectedTrialBeltId={setSelectedTrialBeltId}
          setShowAssessmentConfirm={setShowAssessmentConfirm}
          setShowBeltGuide={setShowBeltGuide}
        />

        {activeJourneyTab === "leadership" ? (
          <MyLeadershipTab
            dimension={selectedDimension}
            dimensionState={selectedState}
            currentBelt={journeyCurrentBelt}
            nextBelt={journeyNextBelt}
            latestAssessment={latestAssessment}
          />
        ) : activeJourneyTab === "story" ? (
          <div className="grid gap-6 xl:grid-cols-[520px_minmax(0,1fr)]">
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="mb-3 text-lg font-semibold text-slate-950">Executive leadership wheel</h2>
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
          </div>
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
          <section className="space-y-5">
            <BeltStepSummary
              dimension={selectedDimension}
              targetBelt={viewedBelt}
              requirements={viewedBeltRequirements}
            />

            <div className="grid gap-6 xl:grid-cols-[520px_minmax(0,1fr)]">
              <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <h2 className="mb-3 text-lg font-semibold text-slate-950">Executive leadership wheel</h2>
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

              <LeadershipStoryCard story={viewedBeltRequirements?.story} />
            </div>

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
              onNavigate={onNavigate}
            />

            {selectedDimension.mvp && <TelemetryPanel telemetry={telemetry} loading={loadingSignals} />}
          </section>
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
        <BeltGuideModal
          currentBelt={journeyCurrentBelt}
          onClose={() => setShowBeltGuide(false)}
        />
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
