from app.services.intent_service import detect_intents

# Test with your real messages
messages = [
    "I'm feeling overwhelmed by my workload",
    "Add task: follow up with John tomorrow",
    "I need to follow up with John about the proposal",
    "Don't create tasks when I'm journaling",
]

for msg in messages:
    result = detect_intents(msg)
    print(f"\nMessage: {msg}")
    print(f"Intents: {result['intents']}")
    print(f"Explicit: {result['explicit_execution']}")
