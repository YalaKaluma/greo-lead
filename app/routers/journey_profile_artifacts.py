from app.services.journey_support import *

router = APIRouter()

# VALUES - FULL CRUD
# ============================================

class ValueCreate(BaseModel):
    title: str
    value_text: str
    why: Optional[str] = None


class ValueUpdate(BaseModel):
    title: Optional[str] = None
    value_text: Optional[str] = None
    why: Optional[str] = None


class ValueResponse(BaseModel):
    id: int
    user_number: str
    title: str
    value_text: str
    why: Optional[str]
    first_seen_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


@router.get("/values", response_model=list[ValueResponse])
def get_values(
        user_number: str,
        db: Session = Depends(get_db)
):
    """Get all values for a user"""
    values = db.query(JourneyValue).filter(
        JourneyValue.user_number == user_number
    ).order_by(JourneyValue.first_seen_at.desc()).all()
    return values


@router.post("/values", response_model=ValueResponse)
def create_value(
        value_data: ValueCreate,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Create a new value"""
    new_value = JourneyValue(
        user_number=user_number,
        title=value_data.title,
        value_text=value_data.value_text,
        why=value_data.why,
        first_seen_at=datetime.now(),
        updated_at=datetime.now()
    )
    db.add(new_value)
    db.commit()
    db.refresh(new_value)
    return new_value


@router.put("/values/{value_id}", response_model=ValueResponse)
def update_value(
        value_id: int,
        value_data: ValueUpdate,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Update a value"""
    value = db.query(JourneyValue).filter(
        JourneyValue.id == value_id,
        JourneyValue.user_number == user_number
    ).first()

    if not value:
        raise HTTPException(status_code=404, detail="Value not found")

    if value_data.title is not None:
        value.title = value_data.title
    if value_data.value_text is not None:
        value.value_text = value_data.value_text
    if value_data.why is not None:
        value.why = value_data.why

    value.updated_at = datetime.now()
    db.commit()
    db.refresh(value)
    return value


@router.delete("/values/{value_id}")
def delete_value(
        value_id: int,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Delete a value"""
    value = db.query(JourneyValue).filter(
        JourneyValue.id == value_id,
        JourneyValue.user_number == user_number
    ).first()

    if not value:
        raise HTTPException(status_code=404, detail="Value not found")

    db.delete(value)
    db.commit()
    return {"success": True, "message": "Value deleted"}


# ============================================
# ACHIEVEMENTS - FULL CRUD
# ============================================

class AchievementCreate(BaseModel):
    title: str
    achievement_text: str
    impact: Optional[str] = None


class AchievementUpdate(BaseModel):
    title: Optional[str] = None
    achievement_text: Optional[str] = None
    impact: Optional[str] = None


class AchievementResponse(BaseModel):
    id: int
    user_number: str
    title: str
    achievement_text: str
    impact: Optional[str]
    first_seen_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


@router.get("/achievements", response_model=list[AchievementResponse])
def get_achievements(
        user_number: str,
        db: Session = Depends(get_db)
):
    """Get all achievements for a user"""
    achievements = db.query(JourneyAchievement).filter(
        JourneyAchievement.user_number == user_number
    ).order_by(JourneyAchievement.first_seen_at.desc()).all()
    return achievements


@router.post("/achievements", response_model=AchievementResponse)
def create_achievement(
        achievement_data: AchievementCreate,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Create a new achievement"""
    new_achievement = JourneyAchievement(
        user_number=user_number,
        title=achievement_data.title,
        achievement_text=achievement_data.achievement_text,
        impact=achievement_data.impact,
        first_seen_at=datetime.now(),
        updated_at=datetime.now()
    )
    db.add(new_achievement)
    db.commit()
    db.refresh(new_achievement)
    return new_achievement


@router.put("/achievements/{achievement_id}", response_model=AchievementResponse)
def update_achievement(
        achievement_id: int,
        achievement_data: AchievementUpdate,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Update an achievement"""
    achievement = db.query(JourneyAchievement).filter(
        JourneyAchievement.id == achievement_id,
        JourneyAchievement.user_number == user_number
    ).first()

    if not achievement:
        raise HTTPException(status_code=404, detail="Achievement not found")

    if achievement_data.title is not None:
        achievement.title = achievement_data.title
    if achievement_data.achievement_text is not None:
        achievement.achievement_text = achievement_data.achievement_text
    if achievement_data.impact is not None:
        achievement.impact = achievement_data.impact

    achievement.updated_at = datetime.now()
    db.commit()
    db.refresh(achievement)
    return achievement


@router.delete("/achievements/{achievement_id}")
def delete_achievement(
        achievement_id: int,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Delete an achievement"""
    achievement = db.query(JourneyAchievement).filter(
        JourneyAchievement.id == achievement_id,
        JourneyAchievement.user_number == user_number
    ).first()

    if not achievement:
        raise HTTPException(status_code=404, detail="Achievement not found")

    db.delete(achievement)
    db.commit()
    return {"success": True, "message": "Achievement deleted"}


# ============================================
# ENERGY SOURCES - FULL CRUD
# ============================================

class EnergySourceCreate(BaseModel):
    title: Optional[str] = None
    source_text: str
    category: Optional[str] = None


class EnergySourceUpdate(BaseModel):
    title: Optional[str] = None
    source_text: Optional[str] = None
    category: Optional[str] = None


class EnergySourceResponse(BaseModel):
    id: int
    user_number: str
    title: Optional[str]
    source_text: str
    category: Optional[str]
    first_seen_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


@router.get("/energy-sources", response_model=list[EnergySourceResponse])
def get_energy_sources(
        user_number: str,
        db: Session = Depends(get_db)
):
    """Get all energy sources for a user"""
    sources = db.query(JourneyEnergySource).filter(
        JourneyEnergySource.user_number == user_number
    ).order_by(JourneyEnergySource.first_seen_at.desc()).all()
    return sources


@router.post("/energy-sources", response_model=EnergySourceResponse)
def create_energy_source(
        source_data: EnergySourceCreate,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Create a new energy source"""
    new_source = JourneyEnergySource(
        user_number=user_number,
        title=source_data.title,
        source_text=source_data.source_text,
        category=source_data.category,
        first_seen_at=datetime.now(),
        updated_at=datetime.now()
    )
    db.add(new_source)
    db.commit()
    db.refresh(new_source)
    return new_source


@router.put("/energy-sources/{source_id}", response_model=EnergySourceResponse)
def update_energy_source(
        source_id: int,
        source_data: EnergySourceUpdate,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Update an energy source"""
    source = db.query(JourneyEnergySource).filter(
        JourneyEnergySource.id == source_id,
        JourneyEnergySource.user_number == user_number
    ).first()

    if not source:
        raise HTTPException(status_code=404, detail="Energy source not found")

    if source_data.title is not None:
        source.title = source_data.title
    if source_data.source_text is not None:
        source.source_text = source_data.source_text
    if source_data.category is not None:
        source.category = source_data.category

    source.updated_at = datetime.now()
    db.commit()
    db.refresh(source)
    return source


@router.delete("/energy-sources/{source_id}")
def delete_energy_source(
        source_id: int,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Delete an energy source"""
    source = db.query(JourneyEnergySource).filter(
        JourneyEnergySource.id == source_id,
        JourneyEnergySource.user_number == user_number
    ).first()

    if not source:
        raise HTTPException(status_code=404, detail="Energy source not found")

    db.delete(source)
    db.commit()
    return {"success": True, "message": "Energy source deleted"}


# ============================================
# ENERGY DRAINS - FULL CRUD
# ============================================

class EnergyDrainCreate(BaseModel):
    title: Optional[str] = None
    drain_text: str
    category: Optional[str] = None
    mitigation: Optional[str] = None


class EnergyDrainUpdate(BaseModel):
    title: Optional[str] = None
    drain_text: Optional[str] = None
    category: Optional[str] = None
    mitigation: Optional[str] = None


class EnergyDrainResponse(BaseModel):
    id: int
    user_number: str
    title: Optional[str]
    drain_text: str
    category: Optional[str]
    mitigation: Optional[str]
    first_seen_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


@router.get("/energy-drains", response_model=list[EnergyDrainResponse])
def get_energy_drains(
        user_number: str,
        db: Session = Depends(get_db)
):
    """Get all energy drains for a user"""
    drains = db.query(JourneyEnergyDrain).filter(
        JourneyEnergyDrain.user_number == user_number
    ).order_by(JourneyEnergyDrain.first_seen_at.desc()).all()
    return drains


@router.post("/energy-drains", response_model=EnergyDrainResponse)
def create_energy_drain(
        drain_data: EnergyDrainCreate,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Create a new energy drain"""
    new_drain = JourneyEnergyDrain(
        user_number=user_number,
        title=drain_data.title,
        drain_text=drain_data.drain_text,
        category=drain_data.category,
        mitigation=drain_data.mitigation,
        first_seen_at=datetime.now(),
        updated_at=datetime.now()
    )
    db.add(new_drain)
    db.commit()
    db.refresh(new_drain)
    return new_drain


@router.put("/energy-drains/{drain_id}", response_model=EnergyDrainResponse)
def update_energy_drain(
        drain_id: int,
        drain_data: EnergyDrainUpdate,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Update an energy drain"""
    drain = db.query(JourneyEnergyDrain).filter(
        JourneyEnergyDrain.id == drain_id,
        JourneyEnergyDrain.user_number == user_number
    ).first()

    if not drain:
        raise HTTPException(status_code=404, detail="Energy drain not found")

    if drain_data.title is not None:
        drain.title = drain_data.title
    if drain_data.drain_text is not None:
        drain.drain_text = drain_data.drain_text
    if drain_data.category is not None:
        drain.category = drain_data.category
    if drain_data.mitigation is not None:
        drain.mitigation = drain_data.mitigation

    drain.updated_at = datetime.now()
    db.commit()
    db.refresh(drain)
    return drain


@router.delete("/energy-drains/{drain_id}")
def delete_energy_drain(
        drain_id: int,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Delete an energy drain"""
    drain = db.query(JourneyEnergyDrain).filter(
        JourneyEnergyDrain.id == drain_id,
        JourneyEnergyDrain.user_number == user_number
    ).first()

    if not drain:
        raise HTTPException(status_code=404, detail="Energy drain not found")

    db.delete(drain)
    db.commit()
    return {"success": True, "message": "Energy drain deleted"}


# ============================================
# RECOVERY METHODS - FULL CRUD
# ============================================

class RecoveryMethodCreate(BaseModel):
    title: Optional[str] = None
    method_text: str
    category: Optional[str] = None
    frequency: Optional[str] = None


class RecoveryMethodUpdate(BaseModel):
    title: Optional[str] = None
    method_text: Optional[str] = None
    category: Optional[str] = None
    frequency: Optional[str] = None


class RecoveryMethodResponse(BaseModel):
    id: int
    user_number: str
    title: Optional[str]
    method_text: str
    category: Optional[str]
    frequency: Optional[str]
    first_seen_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


@router.get("/recovery-methods", response_model=list[RecoveryMethodResponse])
def get_recovery_methods(
        user_number: str,
        db: Session = Depends(get_db)
):
    """Get all recovery methods for a user"""
    methods = db.query(JourneyRecoveryMethod).filter(
        JourneyRecoveryMethod.user_number == user_number
    ).order_by(JourneyRecoveryMethod.first_seen_at.desc()).all()
    return methods


@router.post("/recovery-methods", response_model=RecoveryMethodResponse)
def create_recovery_method(
        method_data: RecoveryMethodCreate,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Create a new recovery method"""
    new_method = JourneyRecoveryMethod(
        user_number=user_number,
        title=method_data.title,
        method_text=method_data.method_text,
        category=method_data.category,
        frequency=method_data.frequency,
        first_seen_at=datetime.now(),
        updated_at=datetime.now()
    )
    db.add(new_method)
    db.commit()
    db.refresh(new_method)
    return new_method


@router.put("/recovery-methods/{method_id}", response_model=RecoveryMethodResponse)
def update_recovery_method(
        method_id: int,
        method_data: RecoveryMethodUpdate,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Update a recovery method"""
    method = db.query(JourneyRecoveryMethod).filter(
        JourneyRecoveryMethod.id == method_id,
        JourneyRecoveryMethod.user_number == user_number
    ).first()

    if not method:
        raise HTTPException(status_code=404, detail="Recovery method not found")

    if method_data.title is not None:
        method.title = method_data.title
    if method_data.method_text is not None:
        method.method_text = method_data.method_text
    if method_data.category is not None:
        method.category = method_data.category
    if method_data.frequency is not None:
        method.frequency = method_data.frequency

    method.updated_at = datetime.now()
    db.commit()
    db.refresh(method)
    return method


@router.delete("/recovery-methods/{method_id}")
def delete_recovery_method(
        method_id: int,
        user_number: str,
        db: Session = Depends(get_db)
):
    """Delete a recovery method"""
    method = db.query(JourneyRecoveryMethod).filter(
        JourneyRecoveryMethod.id == method_id,
        JourneyRecoveryMethod.user_number == user_number
    ).first()

    if not method:
        raise HTTPException(status_code=404, detail="Recovery method not found")

    db.delete(method)
    db.commit()
    return {"success": True, "message": "Recovery method deleted"}


# ============================================
