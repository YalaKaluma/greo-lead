from app.services.gmail_service import list_unread_message_ids, fetch_message

ids = list_unread_message_ids(max_results=3)
print("Unread IDs:", ids)

for mid in ids:
    m = fetch_message(mid)
    print("\n---")
    print("From:", m["from_email"])
    print("Subject:", m["subject"])
    print("Body preview:", (m["body"][:300] + "...") if len(m["body"]) > 300 else m["body"])
