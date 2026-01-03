from app.services.gmail_service import list_unread_message_ids, fetch_message, mark_as_read
from app.email_processor import process_email

ids = list_unread_message_ids(max_results=1)

if not ids:
    print("No unread emails.")
else:
    msg = fetch_message(ids[0])
    process_email(msg)
    mark_as_read(msg["id"])
    print("Processed one email.")
