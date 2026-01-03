from app.email_prompt import SYSTEM_PROMPT
from app.services.openai_service import draft_email
from app.services.gmail_service import send_email

def process_email(message: dict):
    user_prompt = f"""
Subject:
{message['subject']}

Email:
{message['body']}
"""

    drafted_text = draft_email(
        system_prompt=SYSTEM_PROMPT,
        user_content=user_prompt
    )

    send_email(
        to=message["from_email"],
        subject=f"Re: {message['subject']}",
        body=drafted_text
    )
