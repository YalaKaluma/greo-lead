from __future__ import annotations

import logging
import os
import json
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

import requests
from sqlalchemy.orm import Session

from app.models import CtoFinding, CtoReview, OperationsIssueDraft, SystemHealthEvent
from app.services.github import repository as github_repository
from app.services.operations_director.health_events import runtime_environment, sanitize_details, sanitize_text


logger = logging.getLogger(__name__)

ACTIVE_FINDING_STATUSES = {"open", "converted_to_issue"}
SEVERITY_SCORE_PENALTY = {"critical": 30, "high": 20, "warning": 10, "medium": 10, "low": 5, "info": 0}
CTO_COPILOT_DEFAULT_MODEL = os.getenv("GITHUB_COPILOT_CTO_MODEL", "gpt-4o")
CTO_COPILOT_DEFAULT_URL = os.getenv("GITHUB_COPILOT_CTO_URL", "https://models.github.ai/inference/chat/completions")


class GitHubCopilotCtoError(RuntimeError):
    pass


def build_github_copilot_cto_prompt(snapshot: dict[str, Any]) -> str:
    compact_snapshot = sanitize_details(snapshot)
    return f"""Act like a pragmatic CTO reviewing Alfred's repository, release posture, and operational signals.

Do not apply simple static thresholds. Use judgment: architecture risk, release readiness, maintainability, security posture, test strategy, product/user impact, and likely engineering leverage.

Return ONLY valid JSON in this shape:
{{
  "findings": [
    {{
      "category": "architecture|security|testing|release_readiness|migration|documentation|maintainability|operations",
      "severity": "critical|high|warning|medium|low|info",
      "title": "short GitHub issue title",
      "summary": "what you noticed",
      "affected_files": ["path/from/repo.py"],
      "affected_modules": ["module-or-area"],
      "evidence": {{"signal": "specific evidence from the snapshot"}},
      "risk": "why this matters",
      "action": "what Codex should do next",
      "confidence": "high|medium|low"
    }}
  ]
}}

Rules:
- Prefer 0 to 8 high-signal findings over broad cleanup.
- Only include findings grounded in the snapshot.
- If the snapshot is too thin, return a finding that explains the missing inspection signal instead of inventing code risks.
- Write each action as a Codex-ready implementation request.

Snapshot:
{json.dumps(compact_snapshot, ensure_ascii=True, default=str)}
"""


def request_github_copilot_cto_findings(snapshot: dict[str, Any]) -> list[dict[str, Any]]:
    token = os.getenv("GITHUB_COPILOT_CTO_TOKEN") or os.getenv("GITHUB_TOKEN")
    if not token:
        raise GitHubCopilotCtoError("GitHub Copilot CTO review is not configured. Set GITHUB_COPILOT_CTO_TOKEN or GITHUB_TOKEN.")

    api_url = os.getenv("GITHUB_COPILOT_CTO_URL", CTO_COPILOT_DEFAULT_URL)
    model = os.getenv("GITHUB_COPILOT_CTO_MODEL", CTO_COPILOT_DEFAULT_MODEL)
    response = requests.post(
        api_url,
        headers={
            "Accept": "application/json",
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
        json={
            "model": model,
            "messages": [
                {
                    "role": "system",
                    "content": "You are GitHub Copilot acting as a CTO. Return concise, grounded JSON only.",
                },
                {"role": "user", "content": build_github_copilot_cto_prompt(snapshot)},
            ],
            "temperature": 0.2,
            "response_format": {"type": "json_object"},
        },
        timeout=45,
    )
    if response.status_code >= 400:
        raise GitHubCopilotCtoError(f"GitHub Copilot CTO review failed with HTTP {response.status_code}.")

    data = response.json()
    try:
        content = data["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as exc:
        raise GitHubCopilotCtoError("GitHub Copilot CTO review returned an unexpected response.") from exc

    try:
        parsed = json.loads(content)
    except json.JSONDecodeError as exc:
        raise GitHubCopilotCtoError("GitHub Copilot CTO review returned invalid JSON.") from exc
    findings = parsed.get("findings") if isinstance(parsed, dict) else None
    if not isinstance(findings, list):
        raise GitHubCopilotCtoError("GitHub Copilot CTO review JSON did not include a findings list.")
    return findings


class CtoDirectorReviewer:
    def __init__(self, db: Session, repo_root: str | Path | None = None):
        self.db = db
        self.repo_root = Path(repo_root or Path(__file__).resolve().parents[3])

    def run_review(self, review_type: str = "manual") -> CtoReview:
        now = datetime.utcnow()
        review = CtoReview(
            environment=runtime_environment(),
            review_type=review_type,
            status="running",
            started_at=now,
            created_at=now,
            updated_at=now,
        )
        self.db.add(review)
        self._flush_or_commit(flush=True)

        try:
            snapshot = self._collect_snapshot()
            candidates = self._build_findings(snapshot)
            created_findings = []
            for candidate in candidates:
                if self._has_active_duplicate(candidate):
                    continue
                finding = self._finding_from_candidate(candidate, review)
                self.db.add(finding)
                created_findings.append(finding)

            scores = self._score_review(created_findings, snapshot)
            review.status = "completed"
            review.completed_at = datetime.utcnow()
            review.updated_at = review.completed_at
            review.source_snapshot_json = sanitize_details(snapshot)
            review.top_risks_json = [self._risk_item(item) for item in created_findings[:5]]
            review.recommendations_json = [item.recommended_action for item in created_findings[:5] if item.recommended_action]
            review.summary = self._summary(created_findings, scores)
            review.architecture_score = scores["architecture_score"]
            review.security_score = scores["security_score"]
            review.maintainability_score = scores["maintainability_score"]
            review.test_coverage_score = scores["test_coverage_score"]
            review.release_readiness_score = scores["release_readiness_score"]
            self._flush_or_commit(flush=False)
            self._refresh(review)
            return review
        except Exception as exc:
            review.status = "failed"
            review.completed_at = datetime.utcnow()
            review.summary = sanitize_text(f"CTO review failed: {exc}", 700)
            review.updated_at = review.completed_at
            self._flush_or_commit(flush=False)
            logger.exception("CTO review failed")
            return review

    def run_weekend_review(self) -> CtoReview:
        return self.run_review("weekly")

    def _collect_snapshot(self) -> dict[str, Any]:
        github_snapshot = self._collect_github_snapshot()
        local_snapshot = self._collect_local_snapshot()
        ops_snapshot = self._collect_operations_snapshot()
        return {
            "github": github_snapshot,
            "local": local_snapshot,
            "operations": ops_snapshot,
            "collected_at": datetime.utcnow().isoformat(),
        }

    def _collect_github_snapshot(self) -> dict[str, Any]:
        snapshot: dict[str, Any] = {
            "available": False,
            "repo_tree": [],
            "recent_commits": [],
            "open_pull_requests": [],
            "recent_pull_requests": [],
            "open_issues": [],
            "workflow_runs": [],
            "error": None,
        }
        try:
            tree = github_repository.get_repo_tree()
            snapshot.update({
                "available": True,
                "repo_tree": self._summarize_tree(tree),
                "recent_commits": self._summarize_commits(github_repository.get_recent_commits()),
                "open_pull_requests": self._summarize_prs(github_repository.get_open_pull_requests()),
                "recent_pull_requests": self._summarize_prs(github_repository.get_recent_pull_requests()),
                "open_issues": self._summarize_issues(github_repository.get_open_issues()),
                "workflow_runs": self._summarize_workflows(github_repository.get_workflow_runs()),
            })
        except Exception as exc:
            snapshot["error"] = sanitize_text(str(exc), 300)
        return snapshot

    def _collect_local_snapshot(self) -> dict[str, Any]:
        files = []
        todos = []
        dependency_files = []
        migration_files = []
        test_files = []
        for path in self._iter_source_files():
            rel = self._rel(path)
            try:
                text = path.read_text(encoding="utf-8", errors="replace")
            except OSError:
                continue
            line_count = text.count("\n") + 1
            files.append({"path": rel, "line_count": line_count, "size": path.stat().st_size})
            if path.name in {"requirements.txt", "requirements-security.txt", "package.json"}:
                dependency_files.append(rel)
            if rel.startswith("db_migrations/") or rel.startswith("alembic/versions/"):
                migration_files.append(rel)
            if rel.startswith("tests/") or path.name.startswith("test_"):
                test_files.append(rel)
            if "TODO" in text or "FIXME" in text:
                todos.append({"path": rel, "markers": text.count("TODO") + text.count("FIXME")})

        return {
            "files": sorted(files, key=lambda item: item["line_count"], reverse=True)[:250],
            "large_files": [item for item in files if item["line_count"] > 800],
            "todo_markers": todos[:100],
            "dependency_files": dependency_files,
            "migration_files": migration_files,
            "test_files": test_files,
            "has_tests": bool(test_files),
        }

    def _collect_operations_snapshot(self) -> dict[str, Any]:
        since = datetime.utcnow() - timedelta(days=14)
        events = []
        drafts = []
        try:
            query = self.db.query(SystemHealthEvent)
            events = (
                query.filter(SystemHealthEvent.last_seen_at >= since)
                .order_by(SystemHealthEvent.last_seen_at.desc(), SystemHealthEvent.id.desc())
                .limit(25)
                .all()
            )
        except Exception:
            events = list(getattr(self.db, "system_health_events", []))[:25]
        try:
            drafts = (
                self.db.query(OperationsIssueDraft)
                .order_by(OperationsIssueDraft.created_at.desc(), OperationsIssueDraft.id.desc())
                .limit(25)
                .all()
            )
        except Exception:
            drafts = list(getattr(self.db, "operations_issue_drafts", []))[:25]

        return {
            "recent_health_events": [
                {
                    "id": event.id,
                    "category": event.category or event.event_type,
                    "severity": event.severity,
                    "target": event.endpoint or event.job_name or event.source,
                    "occurrences": event.occurrence_count or 1,
                }
                for event in events
            ],
            "open_operations_drafts": [
                {"id": draft.id, "title": draft.title, "severity": draft.severity, "status": draft.status}
                for draft in drafts
                if draft.status in {"draft", "approved", "known_issue"}
            ],
        }

    def _build_findings(self, snapshot: dict[str, Any]) -> list[dict[str, Any]]:
        try:
            raw_findings = request_github_copilot_cto_findings(snapshot)
        except GitHubCopilotCtoError as exc:
            logger.warning("GitHub Copilot CTO review unavailable: %s", exc)
            snapshot["cto_review_engine"] = {
                "provider": "github_models",
                "status": "unavailable",
                "model": os.getenv("GITHUB_COPILOT_CTO_MODEL", CTO_COPILOT_DEFAULT_MODEL),
                "endpoint": os.getenv("GITHUB_COPILOT_CTO_URL", CTO_COPILOT_DEFAULT_URL),
                "error": sanitize_text(str(exc), 500),
            }
            return [self._copilot_unavailable_candidate(exc)]

        snapshot["cto_review_engine"] = {
            "provider": "github_models",
            "status": "completed",
            "model": os.getenv("GITHUB_COPILOT_CTO_MODEL", CTO_COPILOT_DEFAULT_MODEL),
            "endpoint": os.getenv("GITHUB_COPILOT_CTO_URL", CTO_COPILOT_DEFAULT_URL),
            "raw_finding_count": len(raw_findings),
        }
        logger.info(
            "GitHub Models CTO review completed with %s raw finding(s) using model %s",
            len(raw_findings),
            snapshot["cto_review_engine"]["model"],
        )

        findings = []
        for raw in raw_findings:
            candidate = self._candidate_from_copilot(raw)
            if candidate:
                findings.append(candidate)
        return sorted(findings, key=lambda item: (self._severity_rank(item["severity"]), item["title"]))[:30]

    def _copilot_unavailable_candidate(self, exc: Exception) -> dict[str, Any]:
        message = sanitize_text(str(exc), 500) or "GitHub Copilot CTO review was unavailable."
        return self._candidate(
            category="release_readiness",
            severity="warning",
            title="GitHub Copilot CTO review needs authorized model access",
            summary="Alfred collected CTO review context, but the external GitHub Copilot CTO review call could not complete.",
            affected_files=["app/services/cto_director/reviewer.py"],
            affected_modules=["cto_director", "github"],
            evidence={"copilot_cto_error": message},
            risk=(
                "The CTO Director can still preserve the review trail, but it cannot ask GitHub Copilot to apply CTO "
                "judgment until the model endpoint and token are authorized."
            ),
            action=(
                "Configure GITHUB_COPILOT_CTO_TOKEN with access to the configured chat-completions endpoint, or set "
                "GITHUB_COPILOT_CTO_URL and GITHUB_COPILOT_CTO_MODEL to an authorized GitHub Models-compatible target."
            ),
            confidence="high",
        )

    def _candidate_from_copilot(self, raw: Any) -> dict[str, Any] | None:
        if not isinstance(raw, dict):
            return None
        category = self._safe_choice(raw.get("category"), {
            "architecture",
            "security",
            "testing",
            "release_readiness",
            "migration",
            "documentation",
            "maintainability",
            "operations",
        }, "maintainability")
        severity = self._safe_choice(raw.get("severity"), {
            "critical",
            "high",
            "warning",
            "medium",
            "low",
            "info",
        }, "warning")
        title = sanitize_text(raw.get("title"), 220)
        summary = sanitize_text(raw.get("summary"), 900)
        risk = sanitize_text(raw.get("risk"), 900)
        action = sanitize_text(raw.get("action"), 900)
        if not title or not summary or not risk or not action:
            return None
        affected_files = self._safe_string_list(raw.get("affected_files"), 12) or ["unknown"]
        affected_modules = self._safe_string_list(raw.get("affected_modules"), 8) or [category]
        evidence = raw.get("evidence") if isinstance(raw.get("evidence"), dict) else {"copilot_evidence": raw.get("evidence")}
        confidence = self._safe_choice(raw.get("confidence"), {"high", "medium", "low"}, "medium")
        return self._candidate(
            category=category,
            severity=severity,
            title=title,
            summary=summary,
            affected_files=affected_files,
            affected_modules=affected_modules,
            evidence=sanitize_details(evidence),
            risk=risk,
            action=action,
            confidence=confidence,
        )

    def _safe_choice(self, value: Any, allowed: set[str], fallback: str) -> str:
        normalized = str(value or "").strip().lower()
        return normalized if normalized in allowed else fallback

    def _safe_string_list(self, value: Any, limit: int) -> list[str]:
        if not isinstance(value, list):
            return []
        items = []
        for item in value:
            text = sanitize_text(item, 220)
            if text:
                items.append(text)
        return items[:limit]

    def _candidate(
        self,
        *,
        category: str,
        severity: str,
        title: str,
        summary: str,
        affected_files: list[str],
        affected_modules: list[str],
        evidence: dict[str, Any],
        risk: str,
        action: str,
        confidence: str,
    ) -> dict[str, Any]:
        labels = sorted(set(["cto-director", "codex-ready", category, severity]))
        return {
            "category": category,
            "severity": severity,
            "title": title[:220],
            "summary": summary,
            "affected_files": affected_files,
            "affected_modules": affected_modules,
            "evidence": sanitize_details(evidence),
            "risk": risk,
            "action": action,
            "confidence": confidence,
            "labels": labels,
        }

    def _finding_from_candidate(self, candidate: dict[str, Any], review: CtoReview) -> CtoFinding:
        brief = build_cto_codex_brief(
            title=candidate["title"],
            category=candidate["category"],
            severity=candidate["severity"],
            summary=candidate["summary"],
            evidence=candidate["evidence"],
            affected_files=candidate["affected_files"],
            affected_modules=candidate["affected_modules"],
            risk=candidate["risk"],
            recommended_action=candidate["action"],
        )
        return CtoFinding(
            cto_review_id=review.id,
            category=candidate["category"],
            severity=candidate["severity"],
            title=candidate["title"],
            summary=candidate["summary"],
            evidence_json=candidate["evidence"],
            affected_files_json=candidate["affected_files"],
            affected_modules_json=candidate["affected_modules"],
            risk_explanation=candidate["risk"],
            recommended_action=candidate["action"],
            codex_brief_markdown=brief,
            confidence=candidate["confidence"],
            status="open",
            github_labels_json=candidate["labels"],
        )

    def _has_active_duplicate(self, candidate: dict[str, Any]) -> bool:
        active = []
        try:
            active = (
                self.db.query(CtoFinding)
                .filter(CtoFinding.status.in_(ACTIVE_FINDING_STATUSES))
                .limit(500)
                .all()
            )
        except Exception:
            active = list(getattr(self.db, "cto_findings", []))
        candidate_files = set(candidate.get("affected_files") or [])
        for finding in active:
            if finding.status not in ACTIVE_FINDING_STATUSES:
                continue
            same_title = finding.title == candidate["title"]
            same_area = finding.category == candidate["category"] and bool(candidate_files & set(finding.affected_files_json or []))
            if same_title or same_area:
                return True
        return False

    def _score_review(self, findings: list[CtoFinding], snapshot: dict[str, Any]) -> dict[str, int]:
        def score_for(category: str, base: int = 92) -> int:
            penalty = sum(
                SEVERITY_SCORE_PENALTY.get((finding.severity or "").lower(), 0)
                for finding in findings
                if finding.category == category
            )
            return max(0, min(100, base - penalty))

        local = snapshot.get("local") or {}
        return {
            "architecture_score": score_for("architecture"),
            "security_score": score_for("security", 94),
            "maintainability_score": max(0, 90 - min(len(local.get("todo_markers") or []) * 2, 20)),
            "test_coverage_score": score_for("testing", 88 if local.get("has_tests") else 60),
            "release_readiness_score": score_for("release_readiness", 92),
        }

    def _summary(self, findings: list[CtoFinding], scores: dict[str, int]) -> str:
        high = [item for item in findings if item.severity in {"critical", "high"}]
        if findings:
            top = findings[0].title
            return (
                f"CTO review completed with {len(findings)} open finding"
                f"{'' if len(findings) == 1 else 's'}, including {len(high)} high/critical risk"
                f"{'' if len(high) == 1 else 's'}. Top priority: {top}."
            )
        return (
            "CTO review completed with no new open findings. "
            f"Architecture {scores['architecture_score']}, security {scores['security_score']}, "
            f"test readiness {scores['test_coverage_score']}, release readiness {scores['release_readiness_score']}."
        )

    def _risk_item(self, finding: CtoFinding) -> dict[str, Any]:
        return {
            "id": finding.id,
            "title": finding.title,
            "severity": finding.severity,
            "category": finding.category,
            "risk": finding.risk_explanation,
        }

    def _iter_source_files(self):
        allowed_roots = ("app", "tests", "db_migrations", "alembic", "docs", ".github")
        allowed_suffixes = {".py", ".jsx", ".js", ".json", ".txt", ".md", ".yml", ".yaml", ".sql"}
        for root in allowed_roots:
            base = self.repo_root / root
            if not base.exists():
                continue
            for path in base.rglob("*"):
                if path.is_file() and path.suffix.lower() in allowed_suffixes:
                    yield path
        for filename in ("requirements.txt", "requirements-security.txt", "README.md", "Dockerfile", "Procfile"):
            path = self.repo_root / filename
            if path.exists():
                yield path

    def _rel(self, path: Path) -> str:
        return path.relative_to(self.repo_root).as_posix()

    def _summarize_tree(self, tree: list[dict[str, Any]]) -> list[dict[str, Any]]:
        return [
            {"path": item.get("path"), "type": item.get("type"), "size": item.get("size")}
            for item in tree[:1000]
        ]

    def _summarize_commits(self, commits: list[dict[str, Any]]) -> list[dict[str, Any]]:
        return [
            {
                "sha": (item.get("sha") or "")[:12],
                "message": sanitize_text((item.get("commit") or {}).get("message"), 180),
                "date": ((item.get("commit") or {}).get("author") or {}).get("date"),
            }
            for item in commits[:20]
        ]

    def _summarize_prs(self, prs: list[dict[str, Any]]) -> list[dict[str, Any]]:
        return [
            {"number": item.get("number"), "title": sanitize_text(item.get("title"), 180), "state": item.get("state")}
            for item in prs[:20]
        ]

    def _summarize_issues(self, issues: list[dict[str, Any]]) -> list[dict[str, Any]]:
        return [
            {"number": item.get("number"), "title": sanitize_text(item.get("title"), 180), "labels": [label.get("name") for label in item.get("labels", [])]}
            for item in issues[:30]
        ]

    def _summarize_workflows(self, runs: list[dict[str, Any]]) -> list[dict[str, Any]]:
        return [
            {
                "id": item.get("id"),
                "name": item.get("name"),
                "status": item.get("status"),
                "conclusion": item.get("conclusion"),
                "html_url": item.get("html_url"),
            }
            for item in runs[:20]
        ]

    def _severity_rank(self, severity: str) -> int:
        return {"critical": 0, "high": 1, "warning": 2, "medium": 2, "low": 3, "info": 4}.get(severity, 5)

    def _flush_or_commit(self, flush: bool) -> None:
        if flush:
            try:
                self.db.flush()
                return
            except Exception as exc:
                logger.debug("Could not flush CTO review session before commit: %s", exc)
        self.db.commit()

    def _refresh(self, item: Any) -> None:
        try:
            self.db.refresh(item)
        except Exception as exc:
            logger.debug("Could not refresh CTO review item after commit: %s", exc)


def build_cto_codex_brief(
    *,
    title: str,
    category: str,
    severity: str,
    summary: str,
    evidence: dict[str, Any],
    affected_files: list[str],
    affected_modules: list[str],
    risk: str,
    recommended_action: str,
) -> str:
    files = "\n".join(f"- {item}" for item in affected_files) or "- unknown"
    modules = ", ".join(affected_modules) or "unknown"
    evidence_lines = "\n".join(f"- {key}: {value}" for key, value in evidence.items()) or "- No additional evidence captured."
    return f"""# Codex Brief - {title}

## Context

Alfred CTO Director flagged this during architecture and release-readiness review.

## Problem

{summary}

## Evidence

- Category: {category}
- Severity: {severity}
- Affected files:
{files}
- Affected modules: {modules}
- Related operational signals: see evidence below when present
- Related issues/PRs if any: none attached in V1

{evidence_lines}

## Risk

{risk}

## Objective

Resolve the CTO finding while preserving current user-facing behavior unless the implementation intentionally changes it.

## Recommended Implementation

{recommended_action}

## Files / Areas Likely Involved

{files}

## Acceptance Criteria

- [ ] The issue is addressed without changing user-facing behavior unless explicitly intended.
- [ ] Tests are added or updated where practical.
- [ ] Existing tests pass.
- [ ] Relevant documentation is updated if architecture/schema/runtime assumptions change.
- [ ] No secrets or private user data are exposed.
- [ ] The implementation is compatible with current dev/prod deployment flow.

## Validation Steps

Run the targeted tests for the affected area, run the broader backend checks where practical, and confirm the CTO finding no longer appears in a fresh review.

## Notes

Generated by Alfred CTO Director.
Approved by Yala before GitHub issue creation.
"""
