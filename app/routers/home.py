from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db import get_db
from app.services.home_dashboard_service import HomeDashboardService

router = APIRouter()


def _serialize_snapshot(snapshot):
    return {
        "id": snapshot.id,
        "user_number": snapshot.user_number,
        "snapshot_date": snapshot.snapshot_date.isoformat() if snapshot.snapshot_date else None,
        "source": snapshot.source,
        "created_at": snapshot.created_at.isoformat() if snapshot.created_at else None,
        "updated_at": snapshot.updated_at.isoformat() if snapshot.updated_at else None,
        "payload": snapshot.payload or {},
    }


@router.get("/dashboard")
def get_home_dashboard(user_number: str, db: Session = Depends(get_db)):
    snapshot = HomeDashboardService(db).get_or_refresh(user_number, force=False, source="on_demand")
    return _serialize_snapshot(snapshot)


@router.post("/dashboard/refresh")
def refresh_home_dashboard(user_number: str, db: Session = Depends(get_db)):
    snapshot = HomeDashboardService(db).refresh(user_number, source="manual")
    return _serialize_snapshot(snapshot)
