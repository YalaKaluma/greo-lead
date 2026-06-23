from app.services.journey_support import *

router = APIRouter()

# PROCRASTINATION PATTERNS - FULL CRUD
# ============================================

class ProcrastinationPatternCreate(BaseModel):
    title: Optional[str] = None
    pattern_text: str
    underlying_reason: Optional[str] = None
    strategy: Optional[str] = None


class ProcrastinationPatternUpdate(BaseModel):
    title: Optional[str] = None
    pattern_text: Optional[str] = None
    underlying_reason: Optional[str] = None
    strategy: Optional[str] = None


class ProcrastinationPatternResponse(BaseModel):
    id: int
    user_number: str
    title: Optional[str]
    pattern_text: str
    underlying_reason: Optional[str]
    strategy: Optional[str]
    first_seen_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


def get_table_columns(db: Session, table_name: str) -> set[str]:
    rows = db.execute(
        text(
            """
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = current_schema()
              AND table_name = :table_name
            """
        ),
        {"table_name": table_name},
    ).scalars().all()
    return set(rows)


def get_procrastination_pattern_columns(db: Session) -> set[str]:
    return get_table_columns(db, "journey_procrastination_patterns")


def serialize_procrastination_pattern(pattern: Any) -> dict[str, Any]:
    if isinstance(pattern, dict):
        now = datetime.now()
        return {
            "id": pattern.get("id"),
            "user_number": pattern.get("user_number"),
            "title": pattern.get("title"),
            "pattern_text": pattern.get("pattern_text"),
            "underlying_reason": pattern.get("underlying_reason") or pattern.get("trigger_text") or pattern.get("trigger"),
            "strategy": pattern.get("strategy") or pattern.get("mitigation"),
            "first_seen_at": pattern.get("first_seen_at") or pattern.get("updated_at") or now,
            "updated_at": pattern.get("updated_at") or pattern.get("first_seen_at") or now,
        }

    return {
        "id": pattern.id,
        "user_number": pattern.user_number,
        "title": pattern.title,
        "pattern_text": pattern.pattern_text,
        "underlying_reason": pattern.underlying_reason,
        "strategy": pattern.strategy,
        "first_seen_at": pattern.first_seen_at,
        "updated_at": pattern.updated_at,
    }


def get_procrastination_pattern_rows(db: Session, user_number: str) -> list[dict[str, Any]]:
    columns = get_procrastination_pattern_columns(db)
    if not columns:
        return []

    optional_columns = [
        "id",
        "user_number",
        "title",
        "pattern_text",
        "underlying_reason",
        "strategy",
        "trigger_text",
        "trigger",
        "mitigation",
        "first_seen_at",
        "updated_at",
    ]
    select_columns = [column for column in optional_columns if column in columns]
    if not {"id", "user_number", "pattern_text"}.issubset(columns):
        return []

    order_column = "first_seen_at" if "first_seen_at" in columns else "id"
    select_query = f"SELECT {', '.join(select_columns)} FROM journey_procrastination_patterns WHERE user_number = :user_number ORDER BY {order_column} DESC"  # nosec B608 - selected columns are limited to known table column names.
    rows = db.execute(text(select_query), {"user_number": user_number}).mappings().all()
    return [dict(row) for row in rows]


def write_procrastination_pattern(
    db: Session,
    user_number: str,
    pattern_data: ProcrastinationPatternCreate | ProcrastinationPatternUpdate,
    pattern_id: Optional[int] = None,
) -> dict[str, Any]:
    columns = get_procrastination_pattern_columns(db)
    if not {"id", "user_number", "pattern_text"}.issubset(columns):
        raise HTTPException(status_code=500, detail="Procrastination table is missing required columns")

    now = datetime.now()
    values = {
        "user_number": user_number,
        "title": pattern_data.title,
        "pattern_text": pattern_data.pattern_text,
        "underlying_reason": getattr(pattern_data, "underlying_reason", None),
        "strategy": getattr(pattern_data, "strategy", None),
        "now": now,
        "pattern_id": pattern_id,
    }

    reason_column = (
        "underlying_reason"
        if "underlying_reason" in columns
        else "trigger_text"
        if "trigger_text" in columns
        else "trigger"
        if "trigger" in columns
        else None
    )
    strategy_column = "strategy" if "strategy" in columns else "mitigation" if "mitigation" in columns else None

    if pattern_id is None:
        insert_fields = ["user_number", "pattern_text"]
        insert_values = [":user_number", ":pattern_text"]

        if "title" in columns:
            insert_fields.append("title")
            insert_values.append(":title")
        if reason_column:
            insert_fields.append(reason_column)
            insert_values.append(":underlying_reason")
        if strategy_column:
            insert_fields.append(strategy_column)
            insert_values.append(":strategy")
        if "first_seen_at" in columns:
            insert_fields.append("first_seen_at")
            insert_values.append(":now")
        if "updated_at" in columns:
            insert_fields.append("updated_at")
            insert_values.append(":now")

        insert_query = f"INSERT INTO journey_procrastination_patterns ({', '.join(insert_fields)}) VALUES ({', '.join(insert_values)}) RETURNING id"  # nosec B608 - inserted columns are limited to known table column names.
        row = db.execute(text(insert_query), values).mappings().first()
    else:
        existing = db.execute(
            text(
                """
                SELECT id
                FROM journey_procrastination_patterns
                WHERE id = :pattern_id AND user_number = :user_number
                """
            ),
            values,
        ).mappings().first()
        if not existing:
            raise HTTPException(status_code=404, detail="Procrastination pattern not found")

        updates = []
        if pattern_data.pattern_text is not None:
            updates.append("pattern_text = :pattern_text")
        if "title" in columns and pattern_data.title is not None:
            updates.append("title = :title")
        if reason_column and getattr(pattern_data, "underlying_reason", None) is not None:
            updates.append(f"{reason_column} = :underlying_reason")
        if strategy_column and getattr(pattern_data, "strategy", None) is not None:
            updates.append(f"{strategy_column} = :strategy")
        if "updated_at" in columns:
            updates.append("updated_at = :now")

        if updates:
            update_query = f"UPDATE journey_procrastination_patterns SET {', '.join(updates)} WHERE id = :pattern_id AND user_number = :user_number"  # nosec B608 - update columns are limited to known table column names.
            db.execute(
                text(update_query),
                values,
            )
        row = {"id": pattern_id}

    db.commit()
    saved_id = row["id"]
    saved = db.execute(
        text(
            """
            SELECT id
            FROM journey_procrastination_patterns
            WHERE id = :pattern_id AND user_number = :user_number
            """
        ),
        {"pattern_id": saved_id, "user_number": user_number},
    ).mappings().first()
    if not saved:
        raise HTTPException(status_code=404, detail="Procrastination pattern not found")

    return next(
        pattern for pattern in get_procrastination_pattern_rows(db, user_number)
        if pattern.get("id") == saved_id
    )


@router.get("/procrastination-patterns", response_model=list[ProcrastinationPatternResponse])
def get_procrastination_patterns(
        user_number: str,
        db: Session = Depends(get_db)
):
    """Get all procrastination patterns for a user"""
    return [serialize_procrastination_pattern(pattern) for pattern in get_procrastination_pattern_rows(db, user_number)]


@router.post("/procrastination-patterns", response_model=ProcrastinationPatternResponse)
def create_procrastination_pattern(
        pattern_data: ProcrastinationPatternCreate,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Create a new procrastination pattern"""
    new_pattern = write_procrastination_pattern(db, user_number, pattern_data)
    return serialize_procrastination_pattern(new_pattern)


@router.put("/procrastination-patterns/{pattern_id}", response_model=ProcrastinationPatternResponse)
def update_procrastination_pattern(
        pattern_id: int,
        pattern_data: ProcrastinationPatternUpdate,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Update a procrastination pattern"""
    pattern = write_procrastination_pattern(db, user_number, pattern_data, pattern_id)
    return serialize_procrastination_pattern(pattern)


@router.delete("/procrastination-patterns/{pattern_id}")
def delete_procrastination_pattern(
        pattern_id: int,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Delete a procrastination pattern"""
    pattern = db.execute(
        text(
            """
            SELECT id
            FROM journey_procrastination_patterns
            WHERE id = :pattern_id AND user_number = :user_number
            """
        ),
        {"pattern_id": pattern_id, "user_number": user_number},
    ).mappings().first()

    if not pattern:
        raise HTTPException(status_code=404, detail="Procrastination pattern not found")

    db.execute(
        text(
            """
            DELETE FROM journey_procrastination_patterns
            WHERE id = :pattern_id AND user_number = :user_number
            """
        ),
        {"pattern_id": pattern_id, "user_number": user_number},
    )
    db.commit()
    return {"success": True, "message": "Procrastination pattern deleted"}


# ============================================
# EXECUTION SYSTEMS - FULL CRUD
# ============================================

class ExecutionSystemCreate(BaseModel):
    title: Optional[str] = None
    system_text: str
    category: Optional[str] = None
    effectiveness: Optional[str] = None


class ExecutionSystemUpdate(BaseModel):
    title: Optional[str] = None
    system_text: Optional[str] = None
    category: Optional[str] = None
    effectiveness: Optional[str] = None


class ExecutionSystemResponse(BaseModel):
    id: int
    user_number: str
    title: Optional[str]
    system_text: str
    category: Optional[str]
    effectiveness: Optional[str]
    first_seen_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


@router.get("/execution-systems", response_model=list[ExecutionSystemResponse])
def get_execution_systems(
        user_number: str,
        db: Session = Depends(get_db)
):
    """Get all execution systems for a user"""
    systems = db.query(JourneyExecutionSystem).filter(
        JourneyExecutionSystem.user_number == user_number
    ).order_by(JourneyExecutionSystem.first_seen_at.desc()).all()
    return systems


@router.post("/execution-systems", response_model=ExecutionSystemResponse)
def create_execution_system(
        system_data: ExecutionSystemCreate,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Create a new execution system"""
    new_system = JourneyExecutionSystem(
        user_number=user_number,
        title=system_data.title,
        system_text=system_data.system_text,
        category=system_data.category,
        effectiveness=system_data.effectiveness,
        first_seen_at=datetime.now(),
        updated_at=datetime.now()
    )
    db.add(new_system)
    db.commit()
    db.refresh(new_system)
    return new_system


@router.put("/execution-systems/{system_id}", response_model=ExecutionSystemResponse)
def update_execution_system(
        system_id: int,
        system_data: ExecutionSystemUpdate,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Update an execution system"""
    system = db.query(JourneyExecutionSystem).filter(
        JourneyExecutionSystem.id == system_id,
        JourneyExecutionSystem.user_number == user_number
    ).first()

    if not system:
        raise HTTPException(status_code=404, detail="Execution system not found")

    if system_data.title is not None:
        system.title = system_data.title
    if system_data.system_text is not None:
        system.system_text = system_data.system_text
    if system_data.category is not None:
        system.category = system_data.category
    if system_data.effectiveness is not None:
        system.effectiveness = system_data.effectiveness

    system.updated_at = datetime.now()
    db.commit()
    db.refresh(system)
    return system


@router.delete("/execution-systems/{system_id}")
def delete_execution_system(
        system_id: int,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Delete an execution system"""
    system = db.query(JourneyExecutionSystem).filter(
        JourneyExecutionSystem.id == system_id,
        JourneyExecutionSystem.user_number == user_number
    ).first()

    if not system:
        raise HTTPException(status_code=404, detail="Execution system not found")

    db.delete(system)
    db.commit()
    return {"success": True, "message": "Execution system deleted"}


# ============================================
# INSPIRATION - FULL CRUD
# ============================================

class InspirationCreate(BaseModel):
    title: Optional[str] = None
    inspiration_text: str
    approach: Optional[str] = None
    effectiveness: Optional[str] = None


class InspirationUpdate(BaseModel):
    title: Optional[str] = None
    inspiration_text: Optional[str] = None
    approach: Optional[str] = None
    effectiveness: Optional[str] = None


class InspirationResponse(BaseModel):
    id: int
    user_number: str
    title: Optional[str]
    inspiration_text: str
    approach: Optional[str]
    effectiveness: Optional[str]
    first_seen_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


@router.get("/inspiration", response_model=list[InspirationResponse])
def get_inspiration(
        user_number: str,
        db: Session = Depends(get_db)
):
    """Get all inspiration entries for a user"""
    inspiration = db.query(JourneyInspiration).filter(
        JourneyInspiration.user_number == user_number
    ).order_by(JourneyInspiration.first_seen_at.desc()).all()
    return inspiration


@router.post("/inspiration", response_model=InspirationResponse)
def create_inspiration(
        inspiration_data: InspirationCreate,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Create a new inspiration entry"""
    new_inspiration = JourneyInspiration(
        user_number=user_number,
        title=inspiration_data.title,
        inspiration_text=inspiration_data.inspiration_text,
        approach=inspiration_data.approach,
        effectiveness=inspiration_data.effectiveness,
        first_seen_at=datetime.now(),
        updated_at=datetime.now()
    )
    db.add(new_inspiration)
    db.commit()
    db.refresh(new_inspiration)
    return new_inspiration


@router.put("/inspiration/{inspiration_id}", response_model=InspirationResponse)
def update_inspiration(
        inspiration_id: int,
        inspiration_data: InspirationUpdate,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Update an inspiration entry"""
    inspiration = db.query(JourneyInspiration).filter(
        JourneyInspiration.id == inspiration_id,
        JourneyInspiration.user_number == user_number
    ).first()

    if not inspiration:
        raise HTTPException(status_code=404, detail="Inspiration not found")

    if inspiration_data.title is not None:
        inspiration.title = inspiration_data.title
    if inspiration_data.inspiration_text is not None:
        inspiration.inspiration_text = inspiration_data.inspiration_text
    if inspiration_data.approach is not None:
        inspiration.approach = inspiration_data.approach
    if inspiration_data.effectiveness is not None:
        inspiration.effectiveness = inspiration_data.effectiveness

    inspiration.updated_at = datetime.now()
    db.commit()
    db.refresh(inspiration)
    return inspiration


@router.delete("/inspiration/{inspiration_id}")
def delete_inspiration(
        inspiration_id: int,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Delete an inspiration entry"""
    inspiration = db.query(JourneyInspiration).filter(
        JourneyInspiration.id == inspiration_id,
        JourneyInspiration.user_number == user_number
    ).first()

    if not inspiration:
        raise HTTPException(status_code=404, detail="Inspiration not found")

    db.delete(inspiration)
    db.commit()
    return {"success": True, "message": "Inspiration deleted"}


# ============================================
# COACHING MOMENTS - FULL CRUD
# ============================================

class CoachingMomentCreate(BaseModel):
    title: Optional[str] = None
    moment_text: str
    person: Optional[str] = None
    outcome: Optional[str] = None
    learning: Optional[str] = None


class CoachingMomentUpdate(BaseModel):
    title: Optional[str] = None
    moment_text: Optional[str] = None
    person: Optional[str] = None
    outcome: Optional[str] = None
    learning: Optional[str] = None


class CoachingMomentResponse(BaseModel):
    id: int
    user_number: str
    title: Optional[str]
    moment_text: str
    person: Optional[str]
    outcome: Optional[str]
    learning: Optional[str]
    first_seen_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


@router.get("/coaching-moments", response_model=list[CoachingMomentResponse])
def get_coaching_moments(
        user_number: str,
        db: Session = Depends(get_db)
):
    """Get all coaching moments for a user"""
    moments = db.query(JourneyCoachingMoment).filter(
        JourneyCoachingMoment.user_number == user_number
    ).order_by(JourneyCoachingMoment.first_seen_at.desc()).all()
    return moments


@router.post("/coaching-moments", response_model=CoachingMomentResponse)
def create_coaching_moment(
        moment_data: CoachingMomentCreate,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Create a new coaching moment"""
    new_moment = JourneyCoachingMoment(
        user_number=user_number,
        title=moment_data.title,
        moment_text=moment_data.moment_text,
        person=moment_data.person,
        outcome=moment_data.outcome,
        learning=moment_data.learning,
        first_seen_at=datetime.now(),
        updated_at=datetime.now()
    )
    db.add(new_moment)
    db.commit()
    db.refresh(new_moment)
    return new_moment


@router.put("/coaching-moments/{moment_id}", response_model=CoachingMomentResponse)
def update_coaching_moment(
        moment_id: int,
        moment_data: CoachingMomentUpdate,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Update a coaching moment"""
    moment = db.query(JourneyCoachingMoment).filter(
        JourneyCoachingMoment.id == moment_id,
        JourneyCoachingMoment.user_number == user_number
    ).first()

    if not moment:
        raise HTTPException(status_code=404, detail="Coaching moment not found")

    if moment_data.title is not None:
        moment.title = moment_data.title
    if moment_data.moment_text is not None:
        moment.moment_text = moment_data.moment_text
    if moment_data.person is not None:
        moment.person = moment_data.person
    if moment_data.outcome is not None:
        moment.outcome = moment_data.outcome
    if moment_data.learning is not None:
        moment.learning = moment_data.learning

    moment.updated_at = datetime.now()
    db.commit()
    db.refresh(moment)
    return moment


@router.delete("/coaching-moments/{moment_id}")
def delete_coaching_moment(
        moment_id: int,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Delete a coaching moment"""
    moment = db.query(JourneyCoachingMoment).filter(
        JourneyCoachingMoment.id == moment_id,
        JourneyCoachingMoment.user_number == user_number
    ).first()

    if not moment:
        raise HTTPException(status_code=404, detail="Coaching moment not found")

    db.delete(moment)
    db.commit()
    return {"success": True, "message": "Coaching moment deleted"}


# ============================================
# TEAM COMPOSITION - FULL CRUD
# ============================================

class TeamCompositionCreate(BaseModel):
    title: Optional[str] = None
    composition_text: str
    team_type: Optional[str] = None
    dynamics: Optional[str] = None


class TeamCompositionUpdate(BaseModel):
    title: Optional[str] = None
    composition_text: Optional[str] = None
    team_type: Optional[str] = None
    dynamics: Optional[str] = None


class TeamCompositionResponse(BaseModel):
    id: int
    user_number: str
    title: Optional[str]
    composition_text: str
    team_type: Optional[str]
    dynamics: Optional[str]
    first_seen_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


@router.get("/team-composition", response_model=list[TeamCompositionResponse])
def get_team_composition(
        user_number: str,
        db: Session = Depends(get_db)
):
    """Get all team composition entries for a user"""
    compositions = db.query(JourneyTeamComposition).filter(
        JourneyTeamComposition.user_number == user_number
    ).order_by(JourneyTeamComposition.first_seen_at.desc()).all()
    return compositions


@router.post("/team-composition", response_model=TeamCompositionResponse)
def create_team_composition(
        composition_data: TeamCompositionCreate,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Create a new team composition entry"""
    new_composition = JourneyTeamComposition(
        user_number=user_number,
        title=composition_data.title,
        composition_text=composition_data.composition_text,
        team_type=composition_data.team_type,
        dynamics=composition_data.dynamics,
        first_seen_at=datetime.now(),
        updated_at=datetime.now()
    )
    db.add(new_composition)
    db.commit()
    db.refresh(new_composition)
    return new_composition


@router.put("/team-composition/{composition_id}", response_model=TeamCompositionResponse)
def update_team_composition(
        composition_id: int,
        composition_data: TeamCompositionUpdate,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Update a team composition entry"""
    composition = db.query(JourneyTeamComposition).filter(
        JourneyTeamComposition.id == composition_id,
        JourneyTeamComposition.user_number == user_number
    ).first()

    if not composition:
        raise HTTPException(status_code=404, detail="Team composition not found")

    if composition_data.title is not None:
        composition.title = composition_data.title
    if composition_data.composition_text is not None:
        composition.composition_text = composition_data.composition_text
    if composition_data.team_type is not None:
        composition.team_type = composition_data.team_type
    if composition_data.dynamics is not None:
        composition.dynamics = composition_data.dynamics

    composition.updated_at = datetime.now()
    db.commit()
    db.refresh(composition)
    return composition


@router.delete("/team-composition/{composition_id}")
def delete_team_composition(
        composition_id: int,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Delete a team composition entry"""
    composition = db.query(JourneyTeamComposition).filter(
        JourneyTeamComposition.id == composition_id,
        JourneyTeamComposition.user_number == user_number
    ).first()

    if not composition:
        raise HTTPException(status_code=404, detail="Team composition not found")

    db.delete(composition)
    db.commit()
    return {"success": True, "message": "Team composition deleted"}

