from app.services.gmail_service import list_unread_message_ids, fetch_message
from app.email_processor import process_email

ids = list_unread_message_ids(max_results=1)

if not ids:
    print("No unread emails.")
    exit()

msg = fetch_message(ids[0])
process_email(msg)

print("Reply sent.")
