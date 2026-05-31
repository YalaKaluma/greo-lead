SUPPORTED_LANGUAGES = {"en": "English", "fr": "French"}
DEFAULT_LANGUAGE = "en"


def normalize_language(language: str | None) -> str:
    return language if language in SUPPORTED_LANGUAGES else DEFAULT_LANGUAGE


def language_name(language: str | None) -> str:
    return SUPPORTED_LANGUAGES[normalize_language(language)]


def response_language_instruction(language: str | None) -> str:
    normalized = normalize_language(language)
    if normalized == "fr":
        return (
            "LANGUAGE REQUIREMENT: Respond in French going forward. "
            "Do not translate user-provided names, quotes, or existing chat history. "
            "Use a professional, warm executive-coach tone."
        )

    return (
        "LANGUAGE REQUIREMENT: Respond in English going forward. "
        "Do not translate user-provided names, quotes, or existing chat history."
    )
