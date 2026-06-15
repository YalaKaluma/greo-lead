from __future__ import annotations

import os
from typing import Any

import requests

from app.services.github.issues import create_github_issue


class GitHubRepositoryError(RuntimeError):
    pass


def _github_config() -> tuple[str, str, str]:
    token = os.getenv("GITHUB_TOKEN")
    owner = os.getenv("GITHUB_OWNER")
    repo = os.getenv("GITHUB_REPO")
    if not token or not owner or not repo:
        missing = [
            name for name, value in {
                "GITHUB_TOKEN": token,
                "GITHUB_OWNER": owner,
                "GITHUB_REPO": repo,
            }.items()
            if not value
        ]
        raise GitHubRepositoryError(
            "GitHub repository inspection is not configured. "
            f"Set {', '.join(missing)} in Railway."
        )
    return token, owner, repo


def _headers(token: str) -> dict[str, str]:
    return {
        "Accept": "application/vnd.github+json",
        "Authorization": f"Bearer {token}",
        "X-GitHub-Api-Version": "2022-11-28",
    }


def _request(path: str, params: dict[str, Any] | None = None) -> Any:
    token, owner, repo = _github_config()
    response = requests.get(
        f"https://api.github.com/repos/{owner}/{repo}{path}",
        params=params or {},
        headers=_headers(token),
        timeout=20,
    )
    if response.status_code >= 400:
        raise GitHubRepositoryError(f"GitHub repository request failed with HTTP {response.status_code}.")
    return response.json()


def get_repo_tree(ref: str = "HEAD") -> list[dict[str, Any]]:
    data = _request(f"/git/trees/{ref}", {"recursive": "1"})
    return data.get("tree") or []


def get_recent_commits(limit: int = 20) -> list[dict[str, Any]]:
    return _request("/commits", {"per_page": limit})


def get_open_pull_requests(limit: int = 20) -> list[dict[str, Any]]:
    return _request("/pulls", {"state": "open", "per_page": limit})


def get_recent_pull_requests(limit: int = 20) -> list[dict[str, Any]]:
    return _request("/pulls", {"state": "all", "sort": "updated", "direction": "desc", "per_page": limit})


def get_open_issues(limit: int = 50) -> list[dict[str, Any]]:
    issues = _request("/issues", {"state": "open", "per_page": limit})
    return [item for item in issues if "pull_request" not in item]


def get_workflow_runs(limit: int = 20) -> list[dict[str, Any]]:
    data = _request("/actions/runs", {"per_page": limit})
    return data.get("workflow_runs") or []


def get_file_contents(path: str) -> str | None:
    data = _request(f"/contents/{path}")
    if data.get("encoding") != "base64":
        return None
    import base64

    return base64.b64decode(data.get("content") or "").decode("utf-8", errors="replace")
