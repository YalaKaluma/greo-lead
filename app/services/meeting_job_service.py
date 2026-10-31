"""Restart-aware database-backed meeting queue using existing durable statuses.

PostgreSQL transaction advisory locks serialize a meeting across workers/replicas.
A dedicated lock-only transaction supports pooled Neon connections; stage writes
use separate short transactions. Lock loss fences subsequent stage writes.
Failed jobs require an explicit retry; pending/in-progress jobs resume on startup.
"""
import logging
import os
import threading
from contextvars import ContextVar

from sqlalchemy import text
from app.db import SessionLocal, engine
from app.models import Meeting

logger = logging.getLogger(__name__)
_lock_lost = ContextVar("meeting_job_lock_lost", default=None)
_wake = threading.Event()
_stop = threading.Event()
_threads = []
_start_lock = threading.Lock()
_local_locks = {}
ACTIVE = ("queued", "transcribing", "analyzing")


class JobLockLost(RuntimeError):
    pass


def ensure_job_lock():
    lost = _lock_lost.get()
    if lost is not None and lost.is_set():
        raise JobLockLost("Meeting worker lost its database lock; another worker may resume it")


def run_meeting_job(meeting_id):
    from app.services.meeting_intelligence_service import process_meeting, reassess_meeting_entities
    lost, finished = threading.Event(), threading.Event()
    connection = None
    heartbeat = None
    local_lock = None
    token = None
    local_acquired = False
    try:
        if engine.dialect.name == "postgresql":
            connection = engine.connect()
            acquired = connection.execute(text("SELECT pg_try_advisory_xact_lock(20852, :id)"),
                                          {"id": meeting_id}).scalar()
            if not acquired:
                return
            def renew():
                while not finished.wait(15):
                    try:
                        connection.execute(text("SELECT 1"))
                    except Exception:
                        lost.set()
                        return
            heartbeat = threading.Thread(target=renew, daemon=True)
            heartbeat.start()
        else:
            with _start_lock:
                local_lock = _local_locks.setdefault(meeting_id, threading.Lock())
            local_acquired = local_lock.acquire(blocking=False)
            if not local_acquired:
                return
        token = _lock_lost.set(lost)
        with SessionLocal() as db:
            meeting = db.get(Meeting, meeting_id)
            if not meeting or meeting.processing_status not in ACTIVE:
                return
            scope = (meeting.context_receipt or {}).get("active_assessment_scope")
        if scope == "entities":
            reassess_meeting_entities(meeting_id)
        else:
            process_meeting(meeting_id)
    finally:
        finished.set()
        if heartbeat:
            heartbeat.join(timeout=25)
        if token is not None:
            _lock_lost.reset(token)
        if connection is not None:
            try:
                connection.rollback()
            finally:
                # Never return a connection with uncertain advisory-lock ownership to the pool.
                connection.invalidate()
                connection.close()
        elif local_lock and local_acquired:
            local_lock.release()


def _worker():
    while not _stop.is_set():
        try:
            with SessionLocal() as db:
                ids = [row[0] for row in db.query(Meeting.id).filter(
                    Meeting.processing_status.in_(ACTIVE)).order_by(Meeting.updated_at, Meeting.id).limit(100).all()]
            for meeting_id in ids:
                if _stop.is_set():
                    break
                try:
                    run_meeting_job(meeting_id)
                except Exception as exc:
                    logger.warning("Meeting worker interrupted meeting=%s error_type=%s", meeting_id, type(exc).__name__)
        except Exception as exc:
            logger.warning("Meeting queue unavailable error_type=%s", type(exc).__name__)
        _wake.wait(15)
        _wake.clear()


def start_meeting_workers():
    with _start_lock:
        if _threads and any(thread.is_alive() for thread in _threads):
            return
        _stop.clear()
        for _ in range(max(1, min(4, int(os.getenv("MEETING_WORKERS", "2"))))):
            thread = threading.Thread(target=_worker, name="meeting-worker", daemon=True)
            _threads.append(thread)
            thread.start()


def wake_meeting_workers():
    # The queue is already committed. Losing this notification is harmless:
    # workers poll the database and also recover pending jobs after a restart.
    _wake.set()


def stop_meeting_workers():
    _stop.set()
    _wake.set()
