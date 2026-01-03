import time
import logging

from app.services.gmail_service import (
    list_unread_message_ids,
    fetch_message,
    mark_as_read,
)
from app.email_processor import process_email

POLL_INTERVAL_SECONDS = 60
MAX_EMAILS_PER_CYCLE = 5

log = logging.getLogger(__name__)

def run_email_loop():
    log.info("📧 Alfred email loop started")

    while True:
        try:
            message_ids = list_unread_message_ids(max_results=MAX_EMAILS_PER_CYCLE)

            for message_id in message_ids:
                msg = fetch_message(message_id)

                # Safety: ignore empty emails
                if not msg["body"].strip():
                    mark_as_read(message_id)
                    continue

                process_email(msg)
                mark_as_read(message_id)

        except Exception as e:
            log.exception("Email loop error")

        time.sleep(POLL_INTERVAL_SECONDS)
