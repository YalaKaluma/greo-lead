import os
import json
import urllib.error
import urllib.request
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import func, text
from sqlalchemy.orm import Session

from app.db import engine
from app.models import SystemHealthEvent
from app.services.operations_director.health_events import record_health_event_with_new_session


RAILWAY_GRAPHQL_URL = os.getenv("RAILWAY_GRAPHQL_URL", "https://backboard.railway.com/graphql/v2")


class AdminSystemHealthService:
    def __init__(self, db: Session):
        self.db = db

    def get_recent_errors(self, limit: int = 25) -> list[dict[str, Any]]:
        events = (
            self.db.query(SystemHealthEvent)
            .filter(SystemHealthEvent.severity.in_(["warning", "error", "medium", "high", "critical"]))
            .order_by(SystemHealthEvent.created_at.desc(), SystemHealthEvent.id.desc())
            .limit(limit)
            .all()
        )
        return [self._event_to_dict(event) for event in events]

    def get_railway_log_summary(self, limit: int = 100) -> dict[str, Any]:
        deployment_status = self.get_deployment_status()
        deployments = deployment_status.get("recent_deployments") or []
        latest = deployments[0] if deployments else None
        if not latest:
            return {
                "connected": deployment_status.get("connected", False),
                "status": deployment_status.get("status", "Not connected"),
                "message": deployment_status.get("message", "No Railway deployment available."),
                "logs": [],
                "error_logs": [],
            }

        logs_response = self._railway_graphql(
            """
            query deploymentLogs($deploymentId: String!, $limit: Int) {
              deploymentLogs(deploymentId: $deploymentId, limit: $limit) {
                timestamp
                message
                severity
              }
            }
            """,
            {"deploymentId": latest["id"], "limit": limit},
        )
        if not logs_response["ok"]:
            return {
                "connected": True,
                "status": "Logs unavailable",
                "message": logs_response["error"],
                "deployment_id": latest["id"],
                "logs": [],
                "error_logs": [],
            }

        logs = logs_response["data"].get("deploymentLogs") or []
        normalized_logs = [
            {
                "timestamp": item.get("timestamp"),
                "message": item.get("message") or "",
                "severity": item.get("severity") or "info",
            }
            for item in logs
        ]
        error_logs = [
            item for item in normalized_logs
            if str(item.get("severity", "")).lower() in {"error", "critical"}
            or "@level:error" in item.get("message", "").lower()
        ]
        return {
            "connected": True,
            "status": "Connected",
            "deployment_id": latest["id"],
            "logs": normalized_logs[:limit],
            "error_logs": error_logs[:25],
        }

    def get_log_summary(self) -> dict[str, Any]:
        now = datetime.utcnow()
        since_24h = now - timedelta(hours=24)
        since_7d = now - timedelta(days=7)

        total_24h = self._count(SystemHealthEvent.created_at >= since_24h)
        errors_24h = self._count(SystemHealthEvent.created_at >= since_24h, SystemHealthEvent.severity.in_(["error", "high", "critical"]))
        auth_failures_24h = self._count(SystemHealthEvent.created_at >= since_24h, SystemHealthEvent.event_type == "auth_failure")
        openai_failures_24h = self._count(SystemHealthEvent.created_at >= since_24h, SystemHealthEvent.event_type == "openai_failure")
        email_failures_24h = self._count(SystemHealthEvent.created_at >= since_24h, SystemHealthEvent.event_type == "email_failure")
        database_failures_24h = self._count(SystemHealthEvent.created_at >= since_24h, SystemHealthEvent.event_type == "database_failure")
        slow_requests_24h = self._count(SystemHealthEvent.created_at >= since_24h, SystemHealthEvent.event_type == "slow_request")

        response_time = (
            self.db.query(
                func.avg(SystemHealthEvent.response_time_ms),
                func.max(SystemHealthEvent.response_time_ms),
            )
            .filter(
                SystemHealthEvent.created_at >= since_24h,
                SystemHealthEvent.event_type == "api_response",
                SystemHealthEvent.response_time_ms.isnot(None),
            )
            .first()
        )

        recent_by_type = (
            self.db.query(SystemHealthEvent.event_type, func.count(SystemHealthEvent.id))
            .filter(SystemHealthEvent.created_at >= since_7d)
            .group_by(SystemHealthEvent.event_type)
            .order_by(func.count(SystemHealthEvent.id).desc())
            .limit(10)
            .all()
        )

        return {
            "window": "24h",
            "total_events": total_24h,
            "recent_errors": errors_24h,
            "openai_failures": openai_failures_24h,
            "database_failures": database_failures_24h,
            "email_failures": email_failures_24h,
            "authentication_failures": auth_failures_24h,
            "slow_requests": slow_requests_24h,
            "api_response_times": {
                "average_ms": round(float(response_time[0] or 0)),
                "max_ms": int(response_time[1] or 0),
            },
            "events_by_type_7_days": [
                {"event_type": event_type, "count": count}
                for event_type, count in recent_by_type
            ],
        }

    def get_deployment_status(self) -> dict[str, Any]:
        token = os.getenv("RAILWAY_TOKEN")
        project_id = os.getenv("RAILWAY_PROJECT_ID") or os.getenv("RAILWAY_PROJECT")
        service_id = os.getenv("RAILWAY_SERVICE_ID") or os.getenv("RAILWAY_SERVICE")
        environment_id = os.getenv("RAILWAY_ENVIRONMENT_ID") or os.getenv("RAILWAY_ENVIRONMENT")

        if not token:
            return {
                "provider": "Railway",
                "connected": False,
                "status": "Not connected",
                "message": "RAILWAY_TOKEN is not configured.",
                "recent_deployments": [],
            }

        if not project_id or not service_id:
            return {
                "provider": "Railway",
                "connected": False,
                "status": "Missing IDs",
                "message": "RAILWAY_PROJECT_ID and RAILWAY_SERVICE_ID are required to list deployments.",
                "recent_deployments": [],
            }

        deployment_input = {
            "projectId": project_id,
            "serviceId": service_id,
        }
        if environment_id:
            deployment_input["environmentId"] = environment_id

        response = self._railway_graphql(
            """
            query deployments($input: DeploymentListInput!) {
              deployments(input: $input, first: 5) {
                edges {
                  node {
                    id
                    status
                    createdAt
                    url
                    staticUrl
                  }
                }
              }
            }
            """,
            {"input": deployment_input},
        )
        if not response["ok"]:
            return {
                "provider": "Railway",
                "connected": False,
                "status": "API error",
                "message": response["error"],
                "recent_deployments": [],
            }

        edges = ((response["data"].get("deployments") or {}).get("edges") or [])
        deployments = []
        for edge in edges:
            node = edge.get("node") or {}
            deployments.append({
                "id": node.get("id"),
                "status": node.get("status"),
                "created_at": node.get("createdAt"),
                "url": node.get("url"),
                "static_url": node.get("staticUrl"),
            })

        return {
            "provider": "Railway",
            "connected": True,
            "status": "Connected",
            "message": "Railway deployments are connected.",
            "recent_deployments": deployments,
        }

    def get_health_snapshot(self) -> dict[str, Any]:
        database = self._database_status()
        environment = {
            "openai_configured": bool(os.getenv("OPENAI_API_KEY")),
            "gmail_token_present": bool(os.getenv("GMAIL_TOKEN_JSON")),
        }
        summary = self.get_log_summary()
        railway_logs = self.get_railway_log_summary()

        status = "Healthy"
        if database["status"] != "Connected":
            status = "Degraded"
        elif summary["recent_errors"] or summary["database_failures"] or railway_logs.get("error_logs"):
            status = "Watch"

        return {
            "status": status,
            "checked_at": datetime.utcnow().isoformat(),
            "database": database,
            "environment": environment,
            "summary": summary,
            "recent_errors": self.get_recent_errors(),
            "deployment_status": railway_logs if railway_logs.get("recent_deployments") else self.get_deployment_status(),
            "railway_logs": railway_logs,
        }

    def _database_status(self) -> dict[str, Any]:
        try:
            start = datetime.utcnow()
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            elapsed_ms = round((datetime.utcnow() - start).total_seconds() * 1000)
            return {"status": "Connected", "response_time_ms": elapsed_ms}
        except Exception as exc:
            record_health_event_with_new_session(
                source="database",
                category="database_failure",
                message=str(exc),
                details={"operation": "admin_system_health_database_check"},
                exception_type=type(exc).__name__,
            )
            return {"status": "Error", "response_time_ms": None, "message": str(exc)[:240]}

    def _count(self, *filters) -> int:
        return self.db.query(func.count(SystemHealthEvent.id)).filter(*filters).scalar() or 0

    def _railway_graphql(self, query: str, variables: dict[str, Any]) -> dict[str, Any]:
        token = os.getenv("RAILWAY_TOKEN")
        if not token:
            return {"ok": False, "error": "RAILWAY_TOKEN is not configured.", "data": {}}

        token_type = (os.getenv("RAILWAY_TOKEN_TYPE") or "project").strip().lower()
        headers = {
            "Content-Type": "application/json",
            "User-Agent": "Alfred-Admin-SystemHealth/1.0",
        }
        if token_type in {"account", "workspace", "oauth", "bearer"}:
            headers["Authorization"] = f"Bearer {token}"
        else:
            headers["Project-Access-Token"] = token

        payload = json.dumps({"query": query, "variables": variables}).encode("utf-8")
        request = urllib.request.Request(RAILWAY_GRAPHQL_URL, data=payload, headers=headers, method="POST")

        try:
            with urllib.request.urlopen(request, timeout=8) as response:  # nosec B310 - URL is the fixed HTTPS Railway GraphQL endpoint.
                body = response.read().decode("utf-8")
        except urllib.error.HTTPError as exc:
            body = exc.read().decode("utf-8", errors="replace")
            if token_type not in {"account", "workspace", "oauth", "bearer"} and exc.code in {401, 403}:
                os.environ["RAILWAY_TOKEN_TYPE"] = "account"  # nosec B105 - token type label, not a password.
                return self._railway_graphql(query, variables)
            return {"ok": False, "error": f"Railway API HTTP {exc.code}: {body[:300]}", "data": {}}
        except Exception as exc:
            return {"ok": False, "error": f"Railway API request failed: {str(exc)[:240]}", "data": {}}

        try:
            parsed = json.loads(body)
        except json.JSONDecodeError:
            return {"ok": False, "error": "Railway API returned invalid JSON.", "data": {}}

        if parsed.get("errors"):
            return {"ok": False, "error": json.dumps(parsed["errors"])[:500], "data": parsed.get("data") or {}}
        return {"ok": True, "error": None, "data": parsed.get("data") or {}}

    def _event_to_dict(self, event: SystemHealthEvent) -> dict[str, Any]:
        return {
            "id": event.id,
            "event_type": event.event_type,
            "severity": event.severity,
            "source": event.source,
            "path": event.path,
            "method": event.method,
            "status_code": event.status_code,
            "response_time_ms": event.response_time_ms,
            "message": event.message,
            "metadata": event.metadata_json or {},
            "created_at": event.created_at.isoformat() if event.created_at else None,
        }
