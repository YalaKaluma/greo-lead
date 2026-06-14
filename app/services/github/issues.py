import os
from typing import Any

import requests


class GitHubIssueError(RuntimeError):
    pass


def create_github_issue(
    title: str,
    body: str,
    labels: list[str] | None = None,
    assignees: list[str] | None = None,
) -> dict[str, Any]:
    token = os.getenv("GITHUB_TOKEN")
    owner = os.getenv("GITHUB_OWNER")
    repo = os.getenv("GITHUB_REPO")
    default_assignee = os.getenv("GITHUB_DEFAULT_ASSIGNEE")

    if not token or not owner or not repo:
        raise GitHubIssueError("GitHub issue creation is not configured.")

    final_assignees = list(assignees or [])
    if default_assignee and default_assignee not in final_assignees:
        final_assignees.append(default_assignee)

    payload: dict[str, Any] = {
        "title": title,
        "body": body,
        "labels": labels or [],
    }
    if final_assignees:
        payload["assignees"] = final_assignees

    response = requests.post(
        f"https://api.github.com/repos/{owner}/{repo}/issues",
        json=payload,
        headers={
            "Accept": "application/vnd.github+json",
            "Authorization": f"Bearer {token}",
            "X-GitHub-Api-Version": "2022-11-28",
        },
        timeout=15,
    )
    if response.status_code >= 400:
        raise GitHubIssueError(f"GitHub issue creation failed with HTTP {response.status_code}.")

    data = response.json()
    return {
        "number": data.get("number"),
        "url": data.get("html_url") or data.get("url"),
        "raw": data,
    }
