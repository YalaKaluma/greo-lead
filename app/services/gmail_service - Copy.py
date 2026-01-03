import base64
from email.message import EmailMessage
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from app import config

SCOPES = [
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/gmail.readonly",
]

def get_gmail_service():
    creds = Credentials(
        token=None,
        token_uri="https://oauth2.googleapis.com/token",
        refresh_token=config.GMAIL_REFRESH_TOKEN,
        client_id=config.GMAIL_CLIENT_ID,
        client_secret=config.GMAIL_CLIENT_SECRET,
        scopes=SCOPES,
    )
    return build("gmail", "v1", credentials=creds)

def send_email(to: str, subject: str, body: str):
    service = get_gmail_service()

    msg = EmailMessage()
    msg["From"] = f"Alfred <{config.GMAIL_SENDER_EMAIL}>"
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(body)

    raw = base64.urlsafe_b64encode(msg.as_bytes()).decode()

    service.users().messages().send(
        userId="me",
        body={"raw": raw}
    ).execute()
