# app/services/gmail_service.py
import base64
from email.message import EmailMessage
from email.utils import parseaddr
from typing import List, Optional, Dict, Any, Tuple

from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

from app import config

SCOPES = [
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/gmail.modify",
]

def _require_env(name: str, value: Optional[str]) -> str:
    if not value:
        raise RuntimeError(f"Missing required env var: {name}")
    return value

def get_gmail_service():
    creds = Credentials(
        token=None,
        refresh_token=_require_env("GMAIL_REFRESH_TOKEN", config.GMAIL_REFRESH_TOKEN),
        token_uri="https://oauth2.googleapis.com/token",  # nosec B106 - OAuth token endpoint URL, not a password.
        client_id=_require_env("GMAIL_CLIENT_ID", config.GMAIL_CLIENT_ID),
        client_secret=_require_env("GMAIL_CLIENT_SECRET", config.GMAIL_CLIENT_SECRET),
        scopes=SCOPES,
    )
    return build("gmail", "v1", credentials=creds)

def send_email(to: str, subject: str, body: str):
    service = get_gmail_service()

    sender_email = _require_env("GMAIL_SENDER_EMAIL", config.GMAIL_SENDER_EMAIL)

    msg = EmailMessage()
    msg["From"] = f"Alfred <{sender_email}>"
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(body)

    raw = base64.urlsafe_b64encode(msg.as_bytes()).decode()

    service.users().messages().send(
        userId="me",
        body={"raw": raw},
    ).execute()

def list_unread_message_ids(max_results: int = 5) -> List[str]:
    """
    Returns Gmail message IDs for unread emails in the inbox.
    """
    service = get_gmail_service()
    res = service.users().messages().list(
        userId="me",
        q="is:unread in:inbox",
        maxResults=max_results
    ).execute()
    return [m["id"] for m in res.get("messages", [])]

def mark_as_read(message_id: str) -> None:
    service = get_gmail_service()
    service.users().messages().modify(
        userId="me",
        id=message_id,
        body={"removeLabelIds": ["UNREAD"]},
    ).execute()

def _get_headers(payload: Dict[str, Any]) -> Dict[str, str]:
    headers = payload.get("headers", []) or []
    return {h.get("name", ""): h.get("value", "") for h in headers}

def _decode_body(data: str) -> str:
    # Gmail uses urlsafe base64
    return base64.urlsafe_b64decode(data.encode("utf-8")).decode("utf-8", errors="replace")

def _extract_plain_text(payload: Dict[str, Any]) -> str:
    """
    Best-effort extraction of text/plain from Gmail payload.
    Falls back to text/html (stripped minimally) if needed.
    """
    mime = payload.get("mimeType", "")

    # If payload itself is text/plain
    body = payload.get("body", {}) or {}
    data = body.get("data")
    if mime == "text/plain" and data:
        return _decode_body(data)

    # Multipart: walk parts
    parts = payload.get("parts", []) or []
    stack = parts[:]
    html_candidate = None

    while stack:
        part = stack.pop(0)
        part_mime = part.get("mimeType", "")
        part_body = part.get("body", {}) or {}
        part_data = part_body.get("data")

        if part_mime == "text/plain" and part_data:
            return _decode_body(part_data)

        if part_mime == "text/html" and part_data and html_candidate is None:
            html_candidate = _decode_body(part_data)

        # nested parts
        for child in (part.get("parts", []) or []):
            stack.append(child)

    if html_candidate:
        # Minimal HTML stripping (good enough for v1)
        text = html_candidate.replace("<br>", "\n").replace("<br/>", "\n").replace("<br />", "\n")
        # remove tags crudely
        import re
        text = re.sub(r"<[^>]+>", "", text)
        return text.strip()

    return ""

def fetch_message(message_id: str) -> Dict[str, str]:
    """
    Returns a normalized dict:
    { 'id', 'from_email', 'from_name', 'subject', 'body' }
    """
    service = get_gmail_service()
    msg = service.users().messages().get(
        userId="me",
        id=message_id,
        format="full",
    ).execute()

    payload = msg.get("payload", {}) or {}
    headers = _get_headers(payload)

    from_raw = headers.get("From", "")
    from_name, from_email = parseaddr(from_raw)

    subject = headers.get("Subject", "").strip()
    body = _extract_plain_text(payload).strip()

    return {
        "id": message_id,
        "from_email": from_email,
        "from_name": from_name,
        "subject": subject,
        "body": body,
    }
