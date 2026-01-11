# app/services/intent_service.py
"""
Intent Detection Service for Alfred's Brain

This service analyzes user messages and classifies them into intents
using GPT-4. It provides the foundation for state-driven orchestration.
"""

from openai import OpenAI
from app.config import OPENAI_API_KEY, OPENAI_MODEL
import json
from typing import Dict, List, Any, Optional

client = OpenAI(api_key=OPENAI_API_KEY)


# Intent detection prompt template
INTENT_DETECTION_PROMPT = """You are analyzing a message to Alfred, an AI Chief of Staff for senior executives.

Your task: Classify the user's intent with confidence scores (0.0 to 1.0).

===== USER MESSAGE =====
{user_message}

===== RECENT CONTEXT =====
{recent_context}

===== CURRENT STATE =====
{current_state}

===== INTENTS TO DETECT =====

1. EXECUTE - User wants something done (task, reminder, send email)
   Signals: action verbs, "add this", "remind me", "create", "send"
   
2. COACH - User is reflecting, processing emotions, or journaling
   Signals: "I feel", "I'm thinking about", "struggling with", past tense reflection
   
3. COMMUNICATE - User wants help with writing/drafting
   Signals: "draft", "write", "respond to", "what should I say"
   
4. ORGANIZE - User wants help structuring work or priorities
   Signals: "help me prioritize", "what should I focus on", "organize my"
   
5. THINK - User wants help deciding or reasoning through something
   Signals: "should I", "what do you think", decision-making language
   
6. META - User is correcting Alfred or teaching preferences
   Signals: "don't do that", "remember that I", "you should", corrections
   
7. GOAL_REVIEW - User wants a structured goals performance review session
   Signals: "review my goals", "goal check-in", "progress review", "performance review", "biweekly review", "review [goal name]"

===== EXPLICIT EXECUTION DETECTION =====
Check if the user is EXPLICITLY requesting execution (vs. just mentioning something):
- Explicit: "Add this as a task", "Create a reminder for", "Send email"
- Implicit: "I need to follow up with John" (mentioned, not requested)

===== OUTPUT FORMAT =====
Return ONLY valid JSON (no markdown, no explanation):

{{
  "intents": [
    {{"name": "INTENT_NAME", "confidence": 0.0-1.0}}
  ],
  "explicit_execution": true/false,
  "reasoning": "Brief explanation of classification"
}}

Rules:
- Return ALL intents with confidence > 0.3
- Sort by confidence (highest first)
- Set explicit_execution = true ONLY if user directly requests action
- Keep reasoning under 50 words
"""


def detect_intents(
    user_message: str,
    recent_context: str = "",
    current_state: str = "IDLE"
) -> Dict[str, Any]:
    """
    Detect intents in a user message using GPT-4.
    
    Args:
        user_message: The user's current message
        recent_context: Last 3 exchanges for context (formatted)
        current_state: Current conversation state
        
    Returns:
        {
            "intents": [{"name": "COACH", "confidence": 0.88}],
            "explicit_execution": false,
            "reasoning": "User is processing emotions"
        }
    """
    
    prompt = INTENT_DETECTION_PROMPT.format(
        user_message=user_message,
        recent_context=recent_context or "No recent context",
        current_state=current_state
    )
    
    try:
        response = client.chat.completions.create(
            model=OPENAI_MODEL,
            messages=[
                {"role": "system", "content": "You are an expert at analyzing conversational intent."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.3,  # Lower temperature for more consistent classification
        )
        
        result_text = response.choices[0].message.content.strip()
        
        # Remove markdown code blocks if present
        if result_text.startswith("```"):
            result_text = result_text.split("```")[1]
            if result_text.startswith("json"):
                result_text = result_text[4:]
            result_text = result_text.strip()
        
        result = json.loads(result_text)
        
        # Validate structure
        if "intents" not in result:
            result["intents"] = []
        if "explicit_execution" not in result:
            result["explicit_execution"] = False
        if "reasoning" not in result:
            result["reasoning"] = "No reasoning provided"
            
        # Sort intents by confidence
        result["intents"] = sorted(
            result["intents"], 
            key=lambda x: x.get("confidence", 0), 
            reverse=True
        )
        
        return result
        
    except json.JSONDecodeError as e:
        print(f"⚠️ Intent detection JSON parse error: {e}")
        print(f"Raw response: {result_text}")
        # Fallback to low-confidence COACH intent
        return {
            "intents": [{"name": "COACH", "confidence": 0.4}],
            "explicit_execution": False,
            "reasoning": "JSON parse error - defaulting to coaching"
        }
    
    except Exception as e:
        print(f"❌ Intent detection error: {e}")
        # Safe fallback
        return {
            "intents": [{"name": "COACH", "confidence": 0.3}],
            "explicit_execution": False,
            "reasoning": f"Error in detection: {str(e)}"
        }


def format_recent_context(messages: List[Dict], limit: int = 3) -> str:
    """
    Format recent messages for context.
    
    Args:
        messages: List of {role: "user"|"assistant", content: "..."}
        limit: Number of recent exchanges to include
        
    Returns:
        Formatted string of recent conversation
    """
    if not messages:
        return "No recent context"
    
    recent = messages[-limit * 2:]  # Get last N exchanges (user + assistant pairs)
    
    formatted = []
    for msg in recent:
        role = "User" if msg["role"] == "user" else "Alfred"
        formatted.append(f"{role}: {msg['content']}")
    
    return "\n".join(formatted)


def get_top_intent(intents: List[Dict]) -> Optional[Dict]:
    """Get the highest confidence intent."""
    if not intents:
        return None
    return intents[0]


def has_high_confidence(intent: Dict, threshold: float = 0.75) -> bool:
    """Check if an intent has high confidence."""
    return intent.get("confidence", 0) >= threshold


def has_conflict(intents: List[Dict], delta_threshold: float = 0.15) -> bool:
    """
    Check if there are conflicting intents (multiple with similar confidence).
    
    Args:
        intents: List of intent dicts with confidence scores
        delta_threshold: Maximum confidence difference to consider a conflict
        
    Returns:
        True if top 2 intents have confidence delta < threshold
    """
    if len(intents) < 2:
        return False
    
    top1 = intents[0].get("confidence", 0)
    top2 = intents[1].get("confidence", 0)
    
    return abs(top1 - top2) < delta_threshold
