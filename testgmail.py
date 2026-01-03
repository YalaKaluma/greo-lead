from app.services.gmail_service import send_email

send_email(
    to = "yala.kaluma@gmail.com",  # or any real address you own
    subject="Alfred is alive",
    body="If you received this, Gmail API is fully wired."
)
