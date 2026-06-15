from __future__ import annotations

import logging
import os
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session

from app.models import CtoFinding, CtoReview, OperationsIssueDraft, SystemHealthEvent
from app.services.github import repository as github_repository
from app.services.operations_director.health_events import runtime_environment, sanitize_details, sanitize_text


logger = logging.getLogger(__name__)

ACTIVE_FINDING_STATUSES = {"open", "converted_to_issue"}
SEVERITY_SCORE_PENALTY = {"critical": 30, "high": 20, "warning": 10, "medium": 10, "low": 5, "info": 0}


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
        findings = []
        local = snapshot.get("local") or {}
        github = snapshot.get("github") or {}
        operations = snapshot.get("operations") or {}
        files = local.get("files") or []
        tests = set(local.get("test_files") or [])
        test_text = " ".join(tests).lower()

        for file_info in files:
            line_count = file_info.get("line_count") or 0
            path = file_info.get("path")
            if line_count <= 800:
                continue
            severity = "critical" if line_count > 3000 else "high" if line_count > 1500 else "warning"
            findings.append(self._candidate(
                category="architecture",
                severity=severity,
                title=f"Large module needs ownership split: {path}",
                summary=f"{path} is {line_count} lines, which raises change risk and review cost.",
                affected_files=[path],
                affected_modules=[path.split("/")[0]],
                evidence={"line_count": line_count, "threshold": 800},
                risk="Large files tend to hide multiple responsibilities, increase regression risk, and slow Codex/human review.",
                action="Split the highest-change responsibilities into focused services/components and add targeted regression tests around the moved behavior.",
                confidence="high",
            ))

        for file_info in files:
            path = file_info.get("path", "")
            if not (path.startswith("app/routers/") or path.startswith("app/services/")):
                continue
            stem = Path(path).stem.replace("_", "")
            if stem and stem not in test_text and file_info.get("line_count", 0) >= 250:
                findings.append(self._candidate(
                    category="testing",
                    severity="warning",
                    title=f"Important module has no obvious test coverage: {path}",
                    summary=f"{path} is substantial but no nearby test name was detected.",
                    affected_files=[path],
                    affected_modules=[path.rsplit("/", 1)[0]],
                    evidence={"line_count": file_info.get("line_count"), "test_files_checked": len(tests)},
                    risk="Important behavior can change without a fast signal, especially around admin or orchestration paths.",
                    action="Add focused tests for the module's highest-risk public functions or endpoints before the next release train.",
                    confidence="medium",
                ))

        failed_runs = [run for run in github.get("workflow_runs") or [] if run.get("conclusion") in {"failure", "timed_out", "cancelled"}]
        if failed_runs:
            findings.append(self._candidate(
                category="release_readiness",
                severity="high",
                title="Recent GitHub workflow runs are not clean",
                summary=f"{len(failed_runs)} recent workflow run(s) ended in failure, timeout, or cancellation.",
                affected_files=[".github/workflows/"],
                affected_modules=["ci"],
                evidence={"failed_runs": failed_runs[:5]},
                risk="Release confidence drops when CI is red or unstable, and defects can enter the execution backlog without a reliable gate.",
                action="Inspect the failed workflow logs, fix the underlying failure, and rerun CI before release planning.",
                confidence="high",
            ))

        if not github.get("available"):
            findings.append(self._candidate(
                category="release_readiness",
                severity="warning",
                title="CTO review is missing live GitHub repository signals",
                summary="The review completed from local Alfred context, but GitHub metadata was unavailable.",
                affected_files=["app/services/github/repository.py"],
                affected_modules=["github"],
                evidence={"github_error": github.get("error")},
                risk="Without live GitHub metadata, Alfred may miss recent PR, issue, workflow, and repository-tree risks.",
                action="Configure GitHub repository read access with the same token family used by Operations Director.",
                confidence="high",
            ))

        recurring_events = [
            event for event in operations.get("recent_health_events") or []
            if (event.get("occurrences") or 1) >= 3 or event.get("severity") in {"critical", "high"}
        ]
        if recurring_events:
            findings.append(self._candidate(
                category="release_readiness",
                severity="high",
                title="Recurring production signals should gate release planning",
                summary=f"{len(recurring_events)} recent operational signal(s) are recurring or high severity.",
                affected_files=["app/services/operations_director/", "app/routers/admin_operations.py"],
                affected_modules=["operations"],
                evidence={"operational_signals": recurring_events[:8]},
                risk="Architecture review should incorporate product reality; repeated failures point to reliability debt that can compound.",
                action="Review the linked Operations Director drafts and resolve or explicitly accept the risk before the next release.",
                confidence="medium",
            ))

        if local.get("migration_files") and not any(path.startswith("docs/") and "migration" in path.lower() for path in [item["path"] for item in files]):
            findings.append(self._candidate(
                category="migration",
                severity="info",
                title="Migration notes should stay visible for release planning",
                summary="Schema migration files exist, but migration/release documentation coverage looks light.",
                affected_files=local.get("migration_files")[:5],
                affected_modules=["db_migrations"],
                evidence={"migration_file_count": len(local.get("migration_files") or [])},
                risk="Manual SQL migrations are easier to miss when release notes and verification steps are not kept close to schema changes.",
                action="Keep migration notes and verification steps current in release documentation whenever schema files change.",
                confidence="medium",
            ))

        return sorted(findings, key=lambda item: (self._severity_rank(item["severity"]), item["title"]))[:30]

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
