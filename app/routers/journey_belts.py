from app.services.journey_support import *

from app.utils.safe_errors import log_failure

router = APIRouter()

@router.get("/trial-config")
def get_trial_config():
    return load_journey_trials_config()


@router.get("/subdomain-prompts")
def get_subdomain_prompts():
    return load_journey_subdomain_prompts_config()


@router.get("/validation/{belt}")
def get_belt_validation(
        belt: str,
        user_number: str,
        db: Session = Depends(get_db)
):
    belt_id = (belt or "").strip().lower()
    if belt_id not in BELT_DIMENSION_SIGNALS:
        raise HTTPException(status_code=404, detail="Automatic validation is not available for this belt yet.")
    return validate_belt(db, user_number, belt_id)


@router.get("/validation/{belt}/{dimension_id}")
def get_belt_dimension_validation(
        belt: str,
        dimension_id: str,
        user_number: str,
    db: Session = Depends(get_db)
):
    belt_id = (belt or "").strip().lower()
    if belt_id not in BELT_DIMENSION_SIGNALS:
        raise HTTPException(status_code=404, detail="Automatic validation is not available for this belt yet.")
    if dimension_id not in JOURNEY_DIMENSIONS:
        raise HTTPException(status_code=404, detail="Journey dimension not found.")
    return validate_belt_dimension(db, user_number, belt_id, dimension_id)


class BeltTrialCreate(BaseModel):
    user_number: str
    dimension_id: str
    trial_type: str
    prompt: str
    target_belt: Optional[str] = "yellow"
    response_text: Optional[str] = None
    status: Optional[str] = "in_progress"


class BeltTrialSubmit(BaseModel):
    response_text: str
    status: Optional[str] = "submitted"
    prompt: Optional[str] = None


class BeltTrialResponse(BaseModel):
    id: int
    user_number: str
    dimension_id: str
    target_belt: str
    trial_type: str
    prompt: str
    response_text: Optional[str]
    status: str
    ai_feedback: Optional[str]
    score: Optional[int]
    evidence: Optional[dict]
    started_at: datetime
    submitted_at: Optional[datetime]
    reviewed_at: Optional[datetime]
    updated_at: datetime

    class Config:
        from_attributes = True


class BeltReadinessSubmit(BaseModel):
    current_belt: str
    target_belt: str


class BeltAssessmentResponse(BaseModel):
    id: int
    user_number: str
    current_belt: str
    target_belt: str
    status: str
    readiness_score: Optional[int]
    recommendation: Optional[str]
    assessment_summary: Optional[str]
    dimension_scores: Optional[dict]
    strengths: Optional[list]
    growth_edges: Optional[list]
    domain_feedback: Optional[dict]
    subdomain_feedback: Optional[dict]
    required_next_actions: Optional[list]
    leadership_profile: Optional[dict]
    wheel_feedback: Optional[dict]
    wheel_scores: Optional[dict]
    promotion_limiters: Optional[list]
    strongest_areas: Optional[list]
    priority_next_actions: Optional[list]
    developmental_dimension_scores: Optional[dict]
    journey_depth_scores: Optional[dict]
    final_coaching_note: Optional[str]
    alfred_coaching_note: Optional[str]
    evidence_snapshot: Optional[dict]
    llm_raw_response: Optional[dict]
    accepted_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


@router.get("/belt-readiness/status")
def get_belt_readiness_status(
        user_number: str,
        db: Session = Depends(get_db)
):
    config = load_journey_trials_config()
    status = get_current_belt_status(db, user_number, config)
    if status.get("current_belt") == "white":
        status["assessment_locked_until_yellow"] = True
        status["is_assessment_available"] = False
        status["is_eligible_to_submit"] = False
        status["assessment_lock_title"] = "Leadership Assessment"
        status["assessment_lock_message"] = (
            "Your leadership assessment becomes available once you reach Yellow Belt. "
            "Complete your early Journey exercises, gather evidence through real actions, "
            "and Alfred will unlock your first assessment when you are ready."
        )
    else:
        status["assessment_locked_until_yellow"] = False
        status["is_assessment_available"] = True
    latest_assessment = db.query(BeltAssessment).filter(
        BeltAssessment.user_number.in_(get_user_identifiers(db, user_number)),
        BeltAssessment.current_belt == status["current_belt"],
        BeltAssessment.target_belt == status["target_belt"],
    ).order_by(BeltAssessment.created_at.desc()).first()

    status["latest_assessment_status"] = latest_assessment.status if latest_assessment else None
    status["latest_assessment_id"] = latest_assessment.id if latest_assessment else None
    logger.info(
        "[belt_readiness_response] user_number=%s current_belt=%s target_belt=%s assessment_locked_until_yellow=%s is_assessment_available=%s is_eligible_to_submit=%s latest_assessment_id=%s latest_assessment_status=%s",
        user_number,
        status.get("current_belt"),
        status.get("target_belt"),
        status.get("assessment_locked_until_yellow"),
        status.get("is_assessment_available"),
        status.get("is_eligible_to_submit"),
        status.get("latest_assessment_id"),
        status.get("latest_assessment_status"),
    )
    return status


@router.get("/belt-assessments/latest", response_model=Optional[BeltAssessmentResponse])
def get_latest_belt_assessment(
        user_number: str,
        db: Session = Depends(get_db)
):
    return db.query(BeltAssessment).filter(
        BeltAssessment.user_number.in_(get_user_identifiers(db, user_number))
    ).order_by(BeltAssessment.created_at.desc()).first()


@router.get("/belt-assessments", response_model=list[BeltAssessmentResponse])
def get_belt_assessments(
        user_number: str,
        db: Session = Depends(get_db)
):
    return db.query(BeltAssessment).filter(
        BeltAssessment.user_number.in_(get_user_identifiers(db, user_number))
    ).order_by(BeltAssessment.created_at.desc()).all()


@router.post("/belt-assessments/submit", response_model=BeltAssessmentResponse)
def submit_belt_assessment(
        request: BeltReadinessSubmit,
        user_number: str,
        db: Session = Depends(get_db)
):
    config = load_journey_trials_config()
    readiness = get_current_belt_status(db, user_number, config)
    if readiness.get("current_belt") == "white":
        raise HTTPException(
            status_code=400,
            detail={
                "message": "Leadership assessment becomes available once you reach Yellow Belt.",
                "readiness": readiness,
            },
        )
    if request.current_belt != readiness["current_belt"] or request.target_belt != readiness["target_belt"]:
        raise HTTPException(status_code=400, detail="Requested belt pair does not match current Journey readiness.")
    if not readiness["is_eligible_to_submit"]:
        raise HTTPException(status_code=400, detail={"message": "Belt assessment is locked until all required trials are complete.", "readiness": readiness})

    evidence = gather_belt_assessment_evidence(db, user_number, request.current_belt)
    evidence["target_belt"] = request.target_belt
    prompt_config = load_belt_assessment_prompt()
    system_prompt = prompt_config.get("system", "You are Alfred. Return valid JSON.")
    user_template = prompt_config.get("user_template", "{evidence_json}")
    evidence_json = json.dumps(jsonable_encoder(evidence), ensure_ascii=False, indent=2)
    user_prompt = user_template.format(
        current_belt=request.current_belt,
        target_belt=request.target_belt,
        evidence_json=evidence_json,
    )

    try:
        from openai import OpenAI
        from app.config import OPENAI_API_KEY, OPENAI_MODEL

        client = OpenAI(api_key=OPENAI_API_KEY)
        response = client.chat.completions.create(
            model=OPENAI_MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.25,
            max_tokens=5000,
        )
        raw_text = response.choices[0].message.content or "{}"
        result = parse_assessment_response(raw_text)
    except Exception as error:
        log_failure("journey_belt_assessment", error)
        result = fallback_assessment_from_evidence(evidence)
    result = normalize_assessment_result(result, evidence, request.target_belt)

    recommendation = result.get("recommendation") or "needs_more_evidence"
    if recommendation not in ASSESSMENT_STATUS_VALUES:
        recommendation = "needs_more_evidence"
    readiness_score = result.get("readiness_score")
    try:
        readiness_score = int(readiness_score) if readiness_score is not None else None
    except (TypeError, ValueError):
        readiness_score = None

    assessment = BeltAssessment(
        user_number=user_number,
        current_belt=request.current_belt,
        target_belt=request.target_belt,
        status=recommendation,
        readiness_score=readiness_score,
        recommendation=recommendation,
        assessment_summary=result.get("direct_summary") or result.get("summary") or result.get("assessment_summary"),
        dimension_scores=result.get("dimension_scores") or {},
        strengths=result.get("strengths") or [],
        growth_edges=result.get("growth_edges") or [],
        domain_feedback=result.get("domain_feedback") or {},
        subdomain_feedback=result.get("subdomain_feedback") or {},
        required_next_actions=result.get("required_next_actions") or [],
        leadership_profile=result.get("leadership_profile") or {},
        wheel_feedback=result.get("wheel_feedback") or {},
        wheel_scores=result.get("wheel_scores") or {},
        promotion_limiters=result.get("promotion_limiters") or [],
        strongest_areas=result.get("strongest_areas") or [],
        priority_next_actions=result.get("priority_next_actions") or [],
        developmental_dimension_scores=result.get("developmental_dimension_scores") or result.get("dimension_scores") or {},
        journey_depth_scores=result.get("journey_depth_scores") or result.get("developmental_dimension_scores") or result.get("dimension_scores") or {},
        final_coaching_note=result.get("final_coaching_note") or result.get("alfred_coaching_note"),
        alfred_coaching_note=result.get("alfred_coaching_note") or result.get("final_coaching_note"),
        evidence_snapshot=jsonable_encoder(evidence),
        llm_raw_response=jsonable_encoder(result),
        created_at=datetime.now(),
        updated_at=datetime.now(),
    )
    db.add(assessment)
    db.commit()
    db.refresh(assessment)
    write_audit_log(
        db,
        user_id=user_id_for_identifier(db, user_number),
        event_type="belt_assessment_submitted",
        object_type="belt_assessment",
        object_id=assessment.id,
        metadata={
            "assessment_id": assessment.id,
            "current_belt": request.current_belt,
            "target_belt": request.target_belt,
            "recommendation": assessment.recommendation,
        },
    )
    return assessment


@router.post("/belt-assessments/{assessment_id}/accept-promotion", response_model=BeltAssessmentResponse)
def accept_belt_promotion(
        assessment_id: int,
        user_number: str,
        db: Session = Depends(get_db)
):
    assessment = db.query(BeltAssessment).filter(
        BeltAssessment.id == assessment_id,
        BeltAssessment.user_number.in_(get_user_identifiers(db, user_number)),
    ).first()
    if not assessment:
        raise HTTPException(status_code=404, detail="Belt assessment not found")
    if assessment.recommendation != "ready_for_promotion":
        raise HTTPException(status_code=400, detail="Alfred has not recommended promotion for this assessment.")

    assessment.accepted_at = datetime.now()
    assessment.updated_at = datetime.now()
    db.commit()
    db.refresh(assessment)
    write_audit_log(
        db,
        user_id=user_id_for_identifier(db, user_number),
        event_type="belt_promotion_accepted",
        object_type="belt_assessment",
        object_id=assessment.id,
        metadata={
            "assessment_id": assessment.id,
            "current_belt": assessment.current_belt,
            "target_belt": assessment.target_belt,
            "status": "accepted",
        },
    )
    return assessment


@router.get("/belt-trials", response_model=list[BeltTrialResponse])
def get_belt_trials(
        user_number: str,
        dimension_id: Optional[str] = None,
        target_belt: Optional[str] = None,
        db: Session = Depends(get_db)
):
    trace_id = uuid.uuid4().hex[:8]
    query = db.query(JourneyBeltTrial).filter(JourneyBeltTrial.user_number == user_number)

    if dimension_id:
        query = query.filter(JourneyBeltTrial.dimension_id == dimension_id)
    if target_belt:
        query = query.filter(JourneyBeltTrial.target_belt == target_belt)

    trials = query.order_by(JourneyBeltTrial.started_at.desc()).all()
    logger.info(
        "[belt_trials_get:%s] user=%s dimension_filter=%s belt_filter=%s count=%s statuses=%s",
        trace_id,
        user_number,
        dimension_id,
        target_belt,
        len(trials),
        [
            {
                "id": trial.id,
                "dimension": trial.dimension_id,
                "belt": trial.target_belt,
                "type": trial.trial_type,
                "status": trial.status,
                "score": trial.score,
                "reviewed_at": trial.reviewed_at.isoformat() if trial.reviewed_at else None,
                "response_hash": response_fingerprint(trial.response_text),
                "history_count": len(((trial.evidence or {}).get("feedback_history") or [])),
            }
            for trial in trials[:15]
        ],
    )
    return trials


@router.post("/belt-trials", response_model=BeltTrialResponse)
def start_belt_trial(
        trial_data: BeltTrialCreate,
        db: Session = Depends(get_db)
):
    trace_id = uuid.uuid4().hex[:8]
    logger.info(
        "[belt_trial_create:%s] received user=%s dimension=%s belt=%s type=%s requested_status=%s response_len=%s response_hash=%s",
        trace_id,
        trial_data.user_number,
        trial_data.dimension_id,
        trial_data.target_belt or "yellow",
        trial_data.trial_type,
        trial_data.status,
        len(trial_data.response_text or ""),
        response_fingerprint(trial_data.response_text),
    )
    config = load_journey_trials_config()
    existing = db.query(JourneyBeltTrial).filter(
        JourneyBeltTrial.user_number == trial_data.user_number,
        JourneyBeltTrial.dimension_id == trial_data.dimension_id,
        JourneyBeltTrial.target_belt == (trial_data.target_belt or "yellow"),
        JourneyBeltTrial.trial_type == trial_data.trial_type,
    ).first()

    if existing:
        logger.info(
            "[belt_trial_create:%s] existing trial_id=%s prior_status=%s prior_score=%s prior_response_hash=%s",
            trace_id,
            existing.id,
            existing.status,
            existing.score,
            response_fingerprint(existing.response_text),
        )
        if trial_data.response_text is not None:
            existing.response_text = trial_data.response_text
            existing.status = trial_data.status or "in_progress"
            existing.updated_at = datetime.now()
            if existing.status == "submitted":
                existing.submitted_at = datetime.now()
                apply_trial_review(db, existing, config, trace_id=trace_id)
            db.commit()
            db.refresh(existing)
            if normalize_trial_status(existing.status) == "submitted":
                write_audit_log(
                    db,
                    user_id=user_id_for_identifier(db, trial_data.user_number),
                    event_type="journey_trial_submitted",
                    object_type="journey_belt_trial",
                    object_id=existing.id,
                    metadata={
                        "trial_id": existing.id,
                        "dimension_id": existing.dimension_id,
                        "target_belt": existing.target_belt,
                        "trial_type": existing.trial_type,
                        "status": existing.status,
                    },
                )
            logger.info(
                "[belt_trial_create:%s] existing saved trial_id=%s final_status=%s final_score=%s reviewed_at=%s",
                trace_id,
                existing.id,
                existing.status,
                existing.score,
                existing.reviewed_at,
            )
        return existing

    trial = JourneyBeltTrial(
        user_number=trial_data.user_number,
        dimension_id=trial_data.dimension_id,
        target_belt=trial_data.target_belt or "yellow",
        trial_type=trial_data.trial_type,
        prompt=trial_data.prompt,
        response_text=trial_data.response_text,
        status=trial_data.status or "in_progress",
        started_at=datetime.now(),
        submitted_at=datetime.now() if trial_data.status == "submitted" else None,
        updated_at=datetime.now(),
    )
    if trial.status == "submitted":
        trial.submitted_at = datetime.now()
        apply_trial_review(db, trial, config, trace_id=trace_id)
    db.add(trial)
    db.commit()
    db.refresh(trial)
    if normalize_trial_status(trial.status) == "submitted":
        write_audit_log(
            db,
            user_id=user_id_for_identifier(db, trial_data.user_number),
            event_type="journey_trial_submitted",
            object_type="journey_belt_trial",
            object_id=trial.id,
            metadata={
                "trial_id": trial.id,
                "dimension_id": trial.dimension_id,
                "target_belt": trial.target_belt,
                "trial_type": trial.trial_type,
                "status": trial.status,
            },
        )
    logger.info(
        "[belt_trial_create:%s] created trial_id=%s final_status=%s final_score=%s reviewed_at=%s",
        trace_id,
        trial.id,
        trial.status,
        trial.score,
        trial.reviewed_at,
    )
    return trial


@router.put("/belt-trials/{trial_id}", response_model=BeltTrialResponse)
def submit_belt_trial(
        trial_id: int,
        trial_data: BeltTrialSubmit,
        user_number: str,
        db: Session = Depends(get_db)
):
    trace_id = uuid.uuid4().hex[:8]
    logger.info(
        "[belt_trial_submit:%s] received trial_id=%s user=%s requested_status=%s response_len=%s response_hash=%s",
        trace_id,
        trial_id,
        user_number,
        trial_data.status,
        len(trial_data.response_text or ""),
        response_fingerprint(trial_data.response_text),
    )
    trial = db.query(JourneyBeltTrial).filter(
        JourneyBeltTrial.id == trial_id,
        JourneyBeltTrial.user_number == user_number
    ).first()

    if not trial:
        logger.warning("[belt_trial_submit:%s] trial not found", trace_id)
        raise HTTPException(status_code=404, detail="Belt trial not found")

    logger.info(
        "[belt_trial_submit:%s] loaded trial_id=%s prior_status=%s prior_score=%s prior_response_hash=%s prior_reviewed_at=%s history_count=%s",
        trace_id,
        trial.id,
        trial.status,
        trial.score,
        response_fingerprint(trial.response_text),
        trial.reviewed_at,
        len(((trial.evidence or {}).get("feedback_history") or [])),
    )
    trial.response_text = trial_data.response_text
    trial.status = trial_data.status or "submitted"
    if trial_data.prompt is not None:
        trial.prompt = trial_data.prompt
    trial.updated_at = datetime.now()
    if normalize_trial_status(trial.status) == "submitted":
        trial.submitted_at = datetime.now()
        config = load_journey_trials_config()
        apply_trial_review(db, trial, config, trace_id=trace_id)
    db.commit()
    db.refresh(trial)
    if normalize_trial_status(trial.status) == "submitted":
        write_audit_log(
            db,
            user_id=user_id_for_identifier(db, user_number),
            event_type="journey_trial_submitted",
            object_type="journey_belt_trial",
            object_id=trial.id,
            metadata={
                "trial_id": trial.id,
                "dimension_id": trial.dimension_id,
                "target_belt": trial.target_belt,
                "trial_type": trial.trial_type,
                "status": trial.status,
            },
        )
    logger.info(
        "[belt_trial_submit:%s] saved trial_id=%s final_status=%s final_score=%s reviewed_at=%s response_hash=%s history_count=%s",
        trace_id,
        trial.id,
        trial.status,
        trial.score,
        trial.reviewed_at,
        response_fingerprint(trial.response_text),
        len(((trial.evidence or {}).get("feedback_history") or [])),
    )
    return trial


submit_belt_trial_response = submit_belt_trial
