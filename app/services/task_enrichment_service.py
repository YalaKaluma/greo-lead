from openai import OpenAI
import os
import json

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

async def enrich_task(task_data):

    prompt = f"""
    You are Alfred, an elite executive chief of staff AI.

    Analyze the following task and enrich it strategically.

    TASK:
    {task_data.get("title")}

    NOTES:
    {task_data.get("notes")}

    Return ONLY valid JSON with:
    - strategic_intent
    - move_the_needle_score
    - estimated_effort
    - suggested_subtasks
    - alfred_help
    - priority_suggestion

    Keep responses concise and executive-oriented.
    """

    response = client.chat.completions.create(
        model="gpt-4o-mini",

        response_format={"type": "json_object"},

        messages=[
            {
                "role": "system",
                "content": "You are Alfred, a world-class executive chief of staff AI."
            },
            {
                "role": "user",
                "content": prompt
            }
        ]
    )

    return json.loads(response.choices[0].message.content)