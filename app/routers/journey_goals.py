from app.services.journey_support import *
from app.config import OPENAI_API_KEY, OPENAI_MODEL
from openai import OpenAI
from app.security_dependencies import require_authenticated_user_identifier
from app.utils.safe_errors import internal_error, log_failure

router = APIRouter()
openai_client_journey = OpenAI(api_key=OPENAI_API_KEY)


def _ensure_onboarding_goal_visible(db: Session, user: User) -> bool:
    """Repair the generated onboarding vision if the result exists but the goals tree does not."""
    if not user or not user.phone_number:
        return False

    onboarding_data = dict(user.onboarding_data or {})
    if onboarding_data.get("onboarding_goal_repaired_at"):
        return False

    result = onboarding_data.get("result") or {}
    proposal = onboarding_data.get("generated_payload") or {}
    goal_spec = proposal.get("goal") or result.get("goal") or {}
    title = (goal_spec.get("title") or "").strip()
    if not title:
        return False

    identifiers = get_user_identifiers(db, user.phone_number)
    existing = (
        db.query(JourneyGoal.id)
        .filter(
            JourneyGoal.user_number.in_(identifiers),
            JourneyGoal.time_horizon.in_(goal_level_variants("vision")),
            ((JourneyGoal.id == result.get("vision_id")) | (JourneyGoal.title == title)),
        )
        .first()
    )
    if existing:
        return False

    vision = JourneyGoal(
        user_number=user.phone_number,
        title=title[:200],
        goal_text=goal_spec.get("description") or title,
        why=goal_spec.get("why"),
        time_horizon="vision",
        sort_order=0,
        first_seen_at=datetime.now(),
        updated_at=datetime.now(),
    )
    db.add(vision)
    db.flush()

    pillar_ids = []
    outcome_ids = []
    for p_index, pillar_spec in enumerate((proposal.get("pillars") or [])[:3]):
        pillar_title = (pillar_spec.get("title") or "").strip()
        if not pillar_title:
            continue
        pillar = JourneyGoal(
            user_number=user.phone_number,
            title=pillar_title[:200],
            goal_text=pillar_spec.get("description") or pillar_title,
            time_horizon="pillar",
            parent_goal_id=vision.id,
            sort_order=p_index,
            first_seen_at=datetime.now(),
            updated_at=datetime.now(),
        )
        db.add(pillar)
        db.flush()
        pillar_ids.append(pillar.id)

        row = []
        for o_index, outcome_spec in enumerate((pillar_spec.get("outcomes") or [])[:3]):
            outcome_title = (outcome_spec.get("title") or "").strip()
            if not outcome_title:
                continue
            outcome = JourneyGoal(
                user_number=user.phone_number,
                title=outcome_title[:200],
                goal_text=outcome_spec.get("description") or outcome_title,
                time_horizon="outcome",
                parent_goal_id=pillar.id,
                sort_order=o_index,
                first_seen_at=datetime.now(),
                updated_at=datetime.now(),
            )
            db.add(outcome)
            db.flush()
            row.append(outcome.id)
        outcome_ids.append(row)

    result.update({
        "vision_id": vision.id,
        "pillar_ids": pillar_ids,
        "outcome_ids": outcome_ids,
    })
    onboarding_data["result"] = result
    onboarding_data["onboarding_goal_repaired_at"] = datetime.utcnow().isoformat()
    user.onboarding_data = onboarding_data
    return True


# GOALS - FULL CRUD
# ========================================
@router.get("/goals", response_model=list[GoalResponse])
def get_goals(
        user_number: str = Depends(require_authenticated_user_identifier),
        db: Session = Depends(get_db)
):
    """Get all goals for a user"""
    user = db.query(User).filter((User.phone_number == user_number) | (User.email == user_number)).first()
    if user and ensure_starter_examples_for_empty_user(db, user):
        db.commit()
    if user and _ensure_onboarding_goal_visible(db, user):
        db.commit()

    identifiers = get_user_identifiers(db, user_number)
    goals = (
        db.query(JourneyGoal)
        .options(
            selectinload(JourneyGoal.value_links).selectinload(JourneyGoalValue.value)
        )
        .filter(JourneyGoal.user_number.in_(identifiers))
        .order_by(JourneyGoal.sort_order, JourneyGoal.first_seen_at.desc())
        .all()
    )

    return [serialize_goal(goal) for goal in goals]


@router.post("/goals", response_model=GoalResponse)
def create_goal(
        goal_data: GoalCreate,
        user_number: str = Depends(require_authenticated_user_identifier),
        db: Session = Depends(get_db)
):
    """Create a new goal"""
    time_horizon = normalize_goal_level(goal_data.time_horizon)
    sort_order = goal_data.sort_order
    if sort_order is None:
        sibling_goals = db.query(JourneyGoal).filter(
            JourneyGoal.user_number == user_number,
            JourneyGoal.time_horizon.in_(goal_level_variants(time_horizon)),
            JourneyGoal.parent_goal_id == goal_data.parent_goal_id
        ).all()
        sort_order = max((goal.sort_order or 0 for goal in sibling_goals), default=-1) + 1

    new_goal = JourneyGoal(
        user_number=user_number,
        title=goal_data.title,
        goal_text=goal_data.goal_text,
        why=goal_data.why,
        time_horizon=time_horizon,
        parent_goal_id=goal_data.parent_goal_id,
        sort_order=sort_order,
        first_seen_at=datetime.now(),
        updated_at=datetime.now()
    )
    db.add(new_goal)
    db.commit()
    db.refresh(new_goal)
    sync_goal_values(db, new_goal, user_number, goal_data.value_ids if time_horizon == "vision" else [])
    db.commit()
    db.refresh(new_goal)
    write_audit_log(
        db,
        user_id=user_id_for_identifier(db, user_number),
        event_type="goal_created",
        object_type="journey_goal",
        object_id=new_goal.id,
        metadata={
            "goal_id": new_goal.id,
            "time_horizon": new_goal.time_horizon,
            "parent_goal_id": new_goal.parent_goal_id,
            "status": "created",
        },
    )
    return serialize_goal(new_goal)


@router.patch("/goals/reorder")
def reorder_goals(
        reorder_data: GoalReorderRequest,
        user_number: str = Depends(require_authenticated_user_identifier),
        db: Session = Depends(get_db)
):
    """Persist manual goal ordering within a single parent scope."""
    horizon_by_type = {
        "long": "long",
        "long_term": "long",
        "vision": "vision",
        "medium": "medium",
        "medium_term": "medium",
        "pillar": "pillar",
        "short": "short",
        "short_term": "short",
        "outcome": "outcome",
    }
    raw_horizon = horizon_by_type.get((reorder_data.goal_type or "").strip().lower())
    expected_horizon = normalize_goal_level(raw_horizon) if raw_horizon else None

    if not expected_horizon:
        raise HTTPException(status_code=400, detail="Invalid goal_type")

    ordered_goal_ids = reorder_data.ordered_goal_ids or []
    if not ordered_goal_ids:
        raise HTTPException(status_code=400, detail="ordered_goal_ids is required")
    if len(ordered_goal_ids) != len(set(ordered_goal_ids)):
        raise HTTPException(status_code=400, detail="ordered_goal_ids must be unique")

    parent_scope = reorder_data.parent_goal_id
    if parent_scope is None:
        parent_scope = reorder_data.parent_id

    goals = db.query(JourneyGoal).filter(
        JourneyGoal.user_number == user_number,
        JourneyGoal.id.in_(ordered_goal_ids)
    ).all()

    if len(goals) != len(ordered_goal_ids):
        raise HTTPException(status_code=400, detail="All reordered goals must belong to the current user")

    goals_by_id = {goal.id: goal for goal in goals}
    for goal in goals:
        if normalize_goal_level(goal.time_horizon) != expected_horizon:
            raise HTTPException(status_code=400, detail="All reordered goals must match goal_type")
        if goal.parent_goal_id != parent_scope:
            raise HTTPException(status_code=400, detail="All reordered goals must share the same parent scope")

    for index, goal_id in enumerate(ordered_goal_ids):
        goal = goals_by_id[goal_id]
        goal.sort_order = index
        goal.updated_at = datetime.now()

    db.commit()

    ordered_goals = []
    for goal_id in ordered_goal_ids:
        goal = goals_by_id[goal_id]
        db.refresh(goal)
        ordered_goals.append(serialize_goal(goal))

    return {"success": True, "goals": ordered_goals}


@router.put("/goals/{goal_id}", response_model=GoalResponse)
def update_goal(
        goal_id: int,
        goal_data: GoalUpdate,
        user_number: str = Depends(require_authenticated_user_identifier),
        db: Session = Depends(get_db)
):
    """Update a goal"""
    goal = db.query(JourneyGoal).filter(
        JourneyGoal.id == goal_id,
        JourneyGoal.user_number == user_number
    ).first()

    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")

    if goal_data.title is not None:
        goal.title = goal_data.title
    if goal_data.goal_text is not None:
        goal.goal_text = goal_data.goal_text
    if goal_data.why is not None:
        goal.why = goal_data.why
    if goal_data.time_horizon is not None:
        goal.time_horizon = normalize_goal_level(goal_data.time_horizon)
    if goal_data.parent_goal_id is not None:
        goal.parent_goal_id = goal_data.parent_goal_id
    if goal_data.sort_order is not None:
        goal.sort_order = goal_data.sort_order

    goal.updated_at = datetime.now()
    db.commit()
    db.refresh(goal)
    if goal_data.value_ids is not None or normalize_goal_level(goal.time_horizon) != "vision":
        sync_goal_values(
            db,
            goal,
            user_number,
            goal_data.value_ids if normalize_goal_level(goal.time_horizon) == "vision" else [],
        )
        db.commit()
        db.refresh(goal)
    return serialize_goal(goal)


@router.delete("/goals/{goal_id}")
def delete_goal(
        goal_id: int,
        user_number: str = Depends(require_authenticated_user_identifier),
        db: Session = Depends(get_db)
):
    """Delete a goal"""
    goal = db.query(JourneyGoal).filter(
        JourneyGoal.id == goal_id,
        JourneyGoal.user_number == user_number
    ).first()

    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")

    # Delete linked review sessions first
    review_sessions = db.query(GoalReviewSession).filter(
        GoalReviewSession.goal_id == goal.id,
        GoalReviewSession.user_number == user_number
    ).all()

    for session in review_sessions:
        db.delete(session)

    wave_links = db.query(WaveGoal).join(VisionRoadmapWave).filter(
        WaveGoal.goal_id == goal.id,
        VisionRoadmapWave.user_number == user_number
    ).all()
    for link in wave_links:
        db.delete(link)

    # Delete goal
    db.delete(goal)
    db.commit()
    write_audit_log(
        db,
        user_id=user_id_for_identifier(db, user_number),
        event_type="goal_deleted",
        object_type="journey_goal",
        object_id=goal_id,
        metadata={"goal_id": goal_id, "status": "deleted"},
    )


    return {"success": True, "message": "Goal deleted"}


# ========================================
# TRANSFORMATION ROADMAP
# ========================================
@router.get("/visions/{vision_id}/roadmap")
def get_vision_roadmap(
        vision_id: int,
        user_number: str = Depends(require_authenticated_user_identifier),
        db: Session = Depends(get_db)
):
    vision = get_user_goal_or_404(db, vision_id, user_number)
    if normalize_goal_level(vision.time_horizon) != "vision":
        raise HTTPException(status_code=400, detail="Roadmaps can only be created for visions")

    user = db.query(User).filter(User.phone_number == user_number).first()
    if user:
        seeded_roadmaps = ensure_starter_roadmaps_seeded(db, user)
        compacted_samples = ensure_starter_goal_samples_compacted(db, user)
        if seeded_roadmaps or compacted_samples:
            db.commit()
            db.refresh(vision)

    waves = db.query(VisionRoadmapWave).filter(
        VisionRoadmapWave.user_number == user_number,
        VisionRoadmapWave.vision_goal_id == vision_id,
    ).order_by(VisionRoadmapWave.sequence_order, VisionRoadmapWave.created_at).all()

    return {
        "vision": serialize_goal(vision),
        "waves": [serialize_wave(wave) for wave in waves],
    }


@router.get("/visions/{vision_id}/progress-review")
def get_vision_progress_review(
        vision_id: int,
        user_number: str = Depends(require_authenticated_user_identifier),
        db: Session = Depends(get_db)
):
    try:
        return VisionProgressReviewService.get_latest_or_generated(db, user_number, vision_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Vision progress review not found")


@router.post("/visions/{vision_id}/progress-review/refresh")
def refresh_vision_progress_review(
        vision_id: int,
        user_number: str = Depends(require_authenticated_user_identifier),
        db: Session = Depends(get_db)
):
    try:
        return VisionProgressReviewService.refresh_vision_progress_review(db, user_number, vision_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Vision progress review not found")
    except Exception as error:
        raise internal_error("vision_progress_review_refresh", error, "The progress review could not be refreshed.")


@router.post("/visions/{vision_id}/waves")
def create_wave(
        vision_id: int,
        wave_data: WaveCreate,
        user_number: str = Depends(require_authenticated_user_identifier),
        db: Session = Depends(get_db)
):
    vision = get_user_goal_or_404(db, vision_id, user_number)
    if normalize_goal_level(vision.time_horizon) != "vision":
        raise HTTPException(status_code=400, detail="Waves must belong to a vision")

    sequence_order = wave_data.sequence_order
    if sequence_order is None:
        existing = db.query(VisionRoadmapWave).filter(
            VisionRoadmapWave.user_number == user_number,
            VisionRoadmapWave.vision_goal_id == vision_id,
        ).all()
        sequence_order = max((wave.sequence_order or 0 for wave in existing), default=-1) + 1

    wave = VisionRoadmapWave(
        user_number=user_number,
        vision_goal_id=vision_id,
        title=wave_data.title,
        description=wave_data.description,
        sequence_order=sequence_order,
        status=validate_wave_status(wave_data.status),
        target_start_date=wave_data.target_start_date,
        target_end_date=wave_data.target_end_date,
        created_at=datetime.now(),
        updated_at=datetime.now(),
    )
    db.add(wave)
    db.commit()
    db.refresh(wave)
    return serialize_wave(wave)


@router.patch("/waves/{wave_id}")
def update_wave(
        wave_id: int,
        wave_data: WaveUpdate,
        user_number: str = Depends(require_authenticated_user_identifier),
        db: Session = Depends(get_db)
):
    wave = db.query(VisionRoadmapWave).filter(
        VisionRoadmapWave.id == wave_id,
        VisionRoadmapWave.user_number == user_number,
    ).first()
    if not wave:
        raise HTTPException(status_code=404, detail="Wave not found")

    if wave_data.title is not None:
        wave.title = wave_data.title
    if wave_data.description is not None:
        wave.description = wave_data.description
    if wave_data.status is not None:
        wave.status = validate_wave_status(wave_data.status)
    if wave_data.target_start_date is not None:
        wave.target_start_date = wave_data.target_start_date
    if wave_data.target_end_date is not None:
        wave.target_end_date = wave_data.target_end_date
    if wave_data.sequence_order is not None:
        wave.sequence_order = wave_data.sequence_order

    wave.updated_at = datetime.now()
    db.commit()
    db.refresh(wave)
    return serialize_wave(wave)


@router.delete("/waves/{wave_id}")
def delete_wave(
        wave_id: int,
        user_number: str = Depends(require_authenticated_user_identifier),
        db: Session = Depends(get_db)
):
    wave = db.query(VisionRoadmapWave).filter(
        VisionRoadmapWave.id == wave_id,
        VisionRoadmapWave.user_number == user_number,
    ).first()
    if not wave:
        raise HTTPException(status_code=404, detail="Wave not found")

    db.delete(wave)
    db.commit()
    return {"success": True}


@router.post("/waves/{wave_id}/goals")
def add_goal_to_wave(
        wave_id: int,
        link_data: WaveGoalCreate,
        user_number: str = Depends(require_authenticated_user_identifier),
        db: Session = Depends(get_db)
):
    wave = db.query(VisionRoadmapWave).filter(
        VisionRoadmapWave.id == wave_id,
        VisionRoadmapWave.user_number == user_number,
    ).first()
    if not wave:
        raise HTTPException(status_code=404, detail="Wave not found")

    goal = get_user_goal_or_404(db, link_data.goal_id, user_number)
    if normalize_goal_level(goal.time_horizon) != "outcome":
        raise HTTPException(status_code=400, detail="Only outcomes can be attached to waves")

    existing_in_vision = db.query(WaveGoal).join(VisionRoadmapWave).filter(
        VisionRoadmapWave.user_number == user_number,
        VisionRoadmapWave.vision_goal_id == wave.vision_goal_id,
        WaveGoal.goal_id == goal.id,
        WaveGoal.wave_id != wave_id,
    ).all()
    for link in existing_in_vision:
        db.delete(link)

    existing = db.query(WaveGoal).filter(
        WaveGoal.wave_id == wave_id,
        WaveGoal.goal_id == goal.id,
    ).first()
    if existing:
        return serialize_wave(wave)

    if link_data.sequence_order is None:
        existing_links = db.query(WaveGoal).filter(WaveGoal.wave_id == wave_id).all()
        sequence_order = max((link.sequence_order or 0 for link in existing_links), default=-1) + 1
    else:
        sequence_order = link_data.sequence_order

    link = WaveGoal(
        wave_id=wave_id,
        goal_id=goal.id,
        sequence_order=sequence_order,
        status=validate_wave_goal_status(link_data.status),
        created_at=datetime.now(),
        updated_at=datetime.now(),
    )
    db.add(link)
    db.commit()
    db.refresh(wave)
    return serialize_wave(wave)


@router.patch("/waves/{wave_id}/goals/reorder")
def reorder_wave_goals(
        wave_id: int,
        reorder_data: WaveGoalReorderRequest,
        user_number: str = Depends(require_authenticated_user_identifier),
        db: Session = Depends(get_db)
):
    wave = db.query(VisionRoadmapWave).filter(
        VisionRoadmapWave.id == wave_id,
        VisionRoadmapWave.user_number == user_number,
    ).first()
    if not wave:
        raise HTTPException(status_code=404, detail="Wave not found")

    links = db.query(WaveGoal).filter(
        WaveGoal.wave_id == wave_id,
        WaveGoal.goal_id.in_(reorder_data.ordered_goal_ids),
    ).all()
    if len(links) != len(reorder_data.ordered_goal_ids):
        raise HTTPException(status_code=400, detail="All reordered goals must belong to this wave")

    by_goal_id = {link.goal_id: link for link in links}
    for index, goal_id in enumerate(reorder_data.ordered_goal_ids):
        by_goal_id[goal_id].sequence_order = index
        by_goal_id[goal_id].updated_at = datetime.now()

    db.commit()
    db.refresh(wave)
    return serialize_wave(wave)


@router.patch("/waves/{wave_id}/goals/{goal_id}")
def update_goal_in_wave(
        wave_id: int,
        goal_id: int,
        link_data: WaveGoalUpdate,
        user_number: str = Depends(require_authenticated_user_identifier),
        db: Session = Depends(get_db)
):
    wave = db.query(VisionRoadmapWave).filter(
        VisionRoadmapWave.id == wave_id,
        VisionRoadmapWave.user_number == user_number,
    ).first()
    if not wave:
        raise HTTPException(status_code=404, detail="Wave not found")

    link = db.query(WaveGoal).filter(
        WaveGoal.wave_id == wave_id,
        WaveGoal.goal_id == goal_id,
    ).first()
    if not link:
        raise HTTPException(status_code=404, detail="Wave goal link not found")

    if link_data.status is not None:
        link.status = validate_wave_goal_status(link_data.status)
    link.updated_at = datetime.now()

    db.commit()
    db.refresh(wave)
    return serialize_wave(wave)


@router.delete("/waves/{wave_id}/goals/{goal_id}")
def remove_goal_from_wave(
        wave_id: int,
        goal_id: int,
        user_number: str = Depends(require_authenticated_user_identifier),
        db: Session = Depends(get_db)
):
    wave = db.query(VisionRoadmapWave).filter(
        VisionRoadmapWave.id == wave_id,
        VisionRoadmapWave.user_number == user_number,
    ).first()
    if not wave:
        raise HTTPException(status_code=404, detail="Wave not found")

    link = db.query(WaveGoal).filter(
        WaveGoal.wave_id == wave_id,
        WaveGoal.goal_id == goal_id,
    ).first()
    if not link:
        raise HTTPException(status_code=404, detail="Wave goal link not found")

    db.delete(link)
    db.commit()
    db.refresh(wave)
    return serialize_wave(wave)


@router.patch("/visions/{vision_id}/waves/reorder")
def reorder_waves(
        vision_id: int,
        reorder_data: WaveReorderRequest,
        user_number: str = Depends(require_authenticated_user_identifier),
        db: Session = Depends(get_db)
):
    waves = db.query(VisionRoadmapWave).filter(
        VisionRoadmapWave.user_number == user_number,
        VisionRoadmapWave.vision_goal_id == vision_id,
        VisionRoadmapWave.id.in_(reorder_data.ordered_wave_ids),
    ).all()
    if len(waves) != len(reorder_data.ordered_wave_ids):
        raise HTTPException(status_code=400, detail="All reordered waves must belong to this vision")

    by_id = {wave.id: wave for wave in waves}
    for index, wave_id in enumerate(reorder_data.ordered_wave_ids):
        by_id[wave_id].sequence_order = index
        by_id[wave_id].updated_at = datetime.now()

    db.commit()
    return {"success": True}


@router.post("/visions/{vision_id}/generate-roadmap")
def generate_roadmap(
        vision_id: int,
        request: RoadmapDraftRequest,
        user_number: str = Depends(require_authenticated_user_identifier),
        db: Session = Depends(get_db)
):
    vision = get_user_goal_or_404(db, vision_id, user_number)
    if normalize_goal_level(vision.time_horizon) != "vision":
        raise HTTPException(status_code=400, detail="Roadmap drafts can only be generated for visions")

    all_goals = db.query(JourneyGoal).filter(JourneyGoal.user_number == user_number).all()
    pillars = [goal for goal in all_goals if goal.parent_goal_id == vision_id and normalize_goal_level(goal.time_horizon) == "pillar"]
    pillar_ids = {goal.id for goal in pillars}
    outcomes = [goal for goal in all_goals if goal.parent_goal_id in pillar_ids and normalize_goal_level(goal.time_horizon) == "outcome"]
    outcome_ids = [goal.id for goal in outcomes]

    tasks = db.query(Task).filter(Task.user_number == user_number, Task.goal_id.in_(outcome_ids)).all() if outcome_ids else []
    habits = db.query(Habit).filter(Habit.user_number == user_number, Habit.goal_id.in_(outcome_ids)).all() if outcome_ids else []

    context = {
        "vision": serialize_goal(vision),
        "pillars": [serialize_goal(goal) for goal in pillars],
        "outcomes": [serialize_goal(goal) for goal in outcomes],
        "tasks": [{"id": task.id, "title": task.title, "goal_id": task.goal_id, "status": task.status} for task in tasks],
        "habits": [{"id": habit.id, "title": habit.title, "goal_id": habit.goal_id, "is_active": habit.is_active} for habit in habits],
    }

    system_prompt = """You are Alfred, a transformation architect. Build a draft roadmap that sequences existing outcomes into 3-5 transformation waves.

Return valid JSON only with this shape:
{"waves":[{"title":"...","description":"...","sequence_order":1,"suggested_goal_ids":[1,2],"new_goal_suggestions":[{"title":"...","description":"..."}],"rationale":"..."}]}

Rules:
- Do not invent IDs. Use only existing outcome IDs in suggested_goal_ids.
- Do not save anything. This is a reviewable draft.
- Keep wave descriptions specific and practical.
- Include new_goal_suggestions only when genuinely useful."""

    try:
        response = openai_client_journey.chat.completions.create(
            model=OPENAI_MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"Create the roadmap draft from this context:\n{context}"},
            ],
            temperature=0.4,
            max_tokens=1200,
        )
        result_text = response.choices[0].message.content.strip()
        if result_text.startswith("```json"):
            result_text = result_text[7:]
        if result_text.endswith("```"):
            result_text = result_text[:-3]

        import json
        draft = json.loads(result_text.strip())
        allowed_ids = set(outcome_ids)
        for index, wave in enumerate(draft.get("waves", []), start=1):
            wave["sequence_order"] = wave.get("sequence_order") or index
            wave["suggested_goal_ids"] = [
                goal_id for goal_id in wave.get("suggested_goal_ids", []) if goal_id in allowed_ids
            ]
            if not request.include_new_goal_suggestions:
                wave["new_goal_suggestions"] = []
        return draft
    except Exception as e:
        log_failure("journey_roadmap_draft", e)
        raise HTTPException(status_code=500, detail="Failed to generate roadmap draft")


