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

INTRO_RECAP_MARKER = "Welcome to Alfred."
LEGACY_INTRO_RECAP_MARKER = "Here is a quick map of Alfred's intro cards"

WELCOME_MESSAGE = """Welcome to Alfred.

I'm excited to work with you.

Alfred is more than a productivity tool. It's a leadership operating system designed to help you turn ambition into action, action into habits, and habits into transformation.

Whether your goals involve your career, health, family, finances, or personal growth, Alfred is here to help you build a clearer vision, stay focused on what matters, and become the person capable of achieving it.

To get started, focus on three simple things:

1. Define where you're going
Visit Vision & Goals and review the sample goals we created for you. They show how Alfred connects long-term vision, life pillars, and measurable outcomes. Edit them, replace them, or create your own.

2. Start taking action
Visit Tasks and you'll find a few starter tasks already waiting for you. Alfred works best when big ambitions are translated into small actions completed consistently over time.

3. Let's get to know each other
Visit My Journey and begin the Leadership Dojo. Through reflections, exercises, and real-world challenges, Alfred will learn about your strengths, aspirations, values, and leadership style so it can provide increasingly personalized guidance.

Once those three foundations are in place, here is a quick map of the rest of Alfred:

Goals
Great leadership starts with a clear destination. Alfred helps you connect vision, pillars, and outcomes so your daily actions support your long-term aspirations.

Tasks
Big goals are achieved through small actions repeated consistently. Use this space to prioritize what matters most and focus on activities that truly move the needle.

Team
Leadership is ultimately about people. Track relationships, strengths, growth areas, aspirations, and important context to become a more intentional leader.

Leadership Journey
Welcome to the Leadership Dojo. Complete trials, earn belts, build evidence through action, and progressively develop your leadership capabilities.

Habits
Transformation rarely comes from a single breakthrough. It comes from consistent actions repeated over time. Habits help you build discipline, energy, and momentum.

Coaching Sessions
A dedicated space for deeper conversations with Alfred around leadership, goals, challenges, and personal growth.

Growth Journal
Your journal is a mirror. Capture experiences, lessons, successes, and setbacks. Over time, Alfred will help you identify patterns and deepen your self-awareness.

Messages
This is where reminders, nudges, opportunities, and updates from Alfred appear to help keep you focused and moving forward.

Settings
Customize Alfred to fit the way you work, including language, preferences, and experience settings.

One final thought: Leadership is not something you learn once. It is something you practice every day. I'm looking forward to being part of that journey with you. 🚀"""


def build_intro_cards_recap() -> str:
    return WELCOME_MESSAGE
