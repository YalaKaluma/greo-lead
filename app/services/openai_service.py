from openai import OpenAI
from app.config import OPENAI_API_KEY, OPENAI_MODEL

client = OpenAI(api_key=OPENAI_API_KEY)

async def generate_reply(conversation_history):
    """
    conversation_history = [
        {"role": "user", "content": "..."},
        {"role": "assistant", "content": "..."}
    ]
    """

    response = client.chat.completions.create(
        model=OPENAI_MODEL,
        messages=[
            {
                "role": "system",
                "content": (
                    "You are a supportive, empathetic life coach who helps users reflect "
                    "deeply through journaling. Keep responses short, warm, and insightful. "
                    "Always ask one gentle follow-up question."
                )
            }
        ] + conversation_history
    )

    return response.choices[0].message.content
