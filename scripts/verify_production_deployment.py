"""Verify that Railway activated the expected commit and security boundaries."""

from __future__ import annotations

import argparse
import json
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


def _request(url: str, *, method: str = "GET", body: dict | None = None, headers=None):
    payload = json.dumps(body).encode("utf-8") if body is not None else None
    request_headers = {"Accept": "application/json", **(headers or {})}
    if payload is not None:
        request_headers["Content-Type"] = "application/json"
    request = Request(url, data=payload, headers=request_headers, method=method)
    try:
        with urlopen(request, timeout=20) as response:  # nosec B310
            return response.status, json.loads(response.read().decode("utf-8"))
    except HTTPError as error:
        try:
            response_body = json.loads(error.read().decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            response_body = {}
        return error.code, response_body


def verify(base_url: str, expected_commit: str, timeout_seconds: int) -> dict:
    if not base_url.startswith("https://"):
        raise ValueError("Production URL must use HTTPS")
    base_url = base_url.rstrip("/")
    deadline = time.monotonic() + timeout_seconds
    last_health: dict = {}
    while time.monotonic() < deadline:
        try:
            status, last_health = _request(f"{base_url}/api/health")
        except (URLError, TimeoutError, json.JSONDecodeError):
            status, last_health = 0, {}
        deployed_commit = str(last_health.get("commit", ""))
        if (
            status == 200
            and last_health.get("status") == "ok"
            and last_health.get("database") == "connected"
            and deployed_commit.startswith(expected_commit)
        ):
            break
        time.sleep(15)
    else:
        raise RuntimeError(
            f"Expected commit {expected_commit} did not become healthy before timeout; "
            f"last health={last_health}"
        )

    login_status, login_body = _request(
        f"{base_url}/api/auth/login",
        method="POST",
        body={"username": "deployment-probe-invalid", "password": "invalid"},  # nosec B105
    )
    scheduler_status, _ = _request(
        f"{base_url}/api/nudge/morning",
        method="POST",
        headers={"X-Alfred-Scheduler-Secret": "invalid-deployment-probe-secret"},
    )
    login_rejected = login_status == 401 or (
        login_status == 200
        and isinstance(login_body, dict)
        and login_body.get("success") is False
    )
    if not login_rejected:
        raise RuntimeError(
            f"Invalid login returned HTTP {login_status} with body {login_body}, "
            "expected 401 or success=false"
        )
    if scheduler_status != 401:
        raise RuntimeError(f"Invalid scheduler credential returned HTTP {scheduler_status}, expected 401")

    return {
        "verified_at": datetime.now(timezone.utc).isoformat(),
        "base_url": base_url,
        "expected_commit": expected_commit,
        "deployed_commit": last_health["commit"],
        "database": last_health["database"],
        "invalid_login_status": login_status,
        "invalid_login_rejected": login_rejected,
        "invalid_scheduler_status": scheduler_status,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", required=True)
    parser.add_argument("--commit", required=True)
    parser.add_argument("--timeout", type=int, default=900)
    parser.add_argument("--evidence", type=Path)
    args = parser.parse_args()
    evidence = verify(args.url, args.commit, max(30, args.timeout))
    rendered = json.dumps(evidence, indent=2, sort_keys=True)
    print(rendered)
    if args.evidence:
        args.evidence.write_text(f"{rendered}\n", encoding="utf-8")


if __name__ == "__main__":
    main()
