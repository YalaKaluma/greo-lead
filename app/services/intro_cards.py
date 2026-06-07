INTRO_CARD_MESSAGES = {
    "my-goals": {
        "title": "Goals",
        "body": "Great leadership starts with a clear destination. We added a couple of example goals to show how Alfred connects vision, pillars, and outcomes. Edit them, delete them, or replace them with the future you want to build.",
    },
    "todo-list": {
        "title": "Tasks",
        "body": "Big goals are achieved through small actions repeated consistently. We added a few starter tasks to help you explore Alfred and begin moving the needle. Use this space to prioritize what matters and turn intention into progress.",
    },
    "my-team": {
        "title": "Team",
        "body": "Leadership is ultimately about people. We added a few example profiles to show how Alfred can help you remember strengths, growth areas, aspirations, and relationship context. Replace them with the people who matter in your own leadership journey.",
    },
    "my-journey": {
        "title": "Leadership Journey",
        "body": "Welcome to the Leadership Dojo. Your wheel, exercises, and belt journey are ready for you. Start with the early trials, gather evidence through real action, and unlock deeper leadership assessments as you progress.",
    },
    "my-habits": {
        "title": "Habits",
        "body": "Transformation rarely comes from a single breakthrough. It comes from consistent actions repeated over time. We added a few starter habits to help you build energy, discipline, reflection, and weekly focus.",
    },
    "coaching-sessions": {
        "title": "Coaching Sessions",
        "body": "This page is where coaching conversations and reflections live. Use it to revisit ideas, capture useful observations, and keep continuity between sessions.",
    },
    "my-journal": {
        "title": "Journal",
        "body": "Your journal is a mirror. We added a couple of sample reflections to show how Alfred can help you move from simple notes to deeper self-awareness. Capture your thoughts, lessons, and experiences, and let patterns emerge over time.",
    },
    "settings": {
        "title": "Settings",
        "body": "Customize Alfred to fit the way you work. Manage your preferences, language, timezone, and experience so your leadership system feels uniquely yours.",
    },
}

INTRO_RECAP_MARKER = "Here is a quick map of Alfred's intro cards"


def build_intro_cards_recap() -> str:
    lines = [
        f"{INTRO_RECAP_MARKER}, all in one place:",
        "",
    ]

    for intro in INTRO_CARD_MESSAGES.values():
        lines.append(f"{intro['title']}: {intro['body']}")

    return "\n\n".join(lines)
