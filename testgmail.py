from app.services.gmail_service import send_email

send_email(
    to="your_personal_email@gmail.com",
    subject="Alfred is alive",
    body="If you received this, Gmail API is fully wired."
)
