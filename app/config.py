# app/config.py
import os
from dotenv import load_dotenv

load_dotenv()

# Database
DIRECT_DATABASE_URL = os.getenv("DIRECT_DATABASE_URL")
DATABASE_URL = os.getenv("DATABASE_URL") or DIRECT_DATABASE_URL

# OpenAI
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o")

# Twilio
TWILIO_SID = os.getenv("TWILIO_SID")
TWILIO_AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN")
TWILIO_WHATSAPP_NUMBER = os.getenv("TWILIO_WHATSAPP_NUMBER")

# Mailgun
MAILGUN_API_KEY = os.getenv("MAILGUN_API_KEY")
MAILGUN_DOMAIN = os.getenv("MAILGUN_DOMAIN")
MAILGUN_FROM = os.getenv("MAILGUN_FROM")

# Web push notifications
VAPID_PUBLIC_KEY = os.getenv("VAPID_PUBLIC_KEY")
VAPID_PRIVATE_KEY = os.getenv("VAPID_PRIVATE_KEY")
VAPID_SUBJECT = os.getenv("VAPID_SUBJECT", "mailto:admin@alfred.local")

# Native mobile push notifications through Firebase Cloud Messaging
FIREBASE_PROJECT_ID = os.getenv("FIREBASE_PROJECT_ID")
FIREBASE_SERVICE_ACCOUNT_JSON = os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON")
FIREBASE_SERVICE_ACCOUNT_B64 = os.getenv("FIREBASE_SERVICE_ACCOUNT_B64")

# User
DEFAULT_USER_NUMBER = os.getenv("DEFAULT_USER_NUMBER")

#gmail
GMAIL_CLIENT_ID= os.getenv("GMAIL_CLIENT_ID")
GMAIL_CLIENT_SECRET= os.getenv("GMAIL_CLIENT_SECRET")
GMAIL_REFRESH_TOKEN= os.getenv("GMAIL_REFRESH_TOKEN")
GMAIL_SENDER_EMAIL= os.getenv("GMAIL_SENDER_EMAIL")
