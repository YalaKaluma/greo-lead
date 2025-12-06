MAX_WHATSAPP_LEN = 1400  # safe buffer under Twilio's ~1600 limit

def split_message(text: str, max_len: int = MAX_WHATSAPP_LEN) -> list[str]:
    """
    Splits a long WhatsApp message into safe chunks without breaking words
    or markdown formatting. Prefers splitting at newlines.
    """
    if not text:
        return [""]

    text = text.strip()
    if len(text) <= max_len:
        return [text]

    parts = []
    while len(text) > max_len:
        # 1. Try splitting at double newline
        cut_at = text.rfind("\n\n", 0, max_len)

        # 2. Try single newline
        if cut_at == -1:
            cut_at = text.rfind("\n", 0, max_len)

        # 3. Try splitting at whitespace
        if cut_at == -1:
            cut_at = text.rfind(" ", 0, max_len)

        # 4. Hard cut fallback
        if cut_at == -1 or cut_at < max_len * 0.5:
            cut_at = max_len

        part = text[:cut_at].strip()
        parts.append(part)

        text = text[cut_at:].strip()

    if text:
        parts.append(text)

    return parts
