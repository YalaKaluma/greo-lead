# app/services/leadership_coaching_orchestrator.py
"""
Leadership Coaching Orchestrator

Real executive coaching for leadership development.
NOT a questionnaire - a genuine conversation that probes patterns, beliefs, and creates experiments.
"""

from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session
from openai import OpenAI
from app.services.leadership_coaching_service import LeadershipCoachingService, LEADERSHIP_QUADRANTS
from app.services.journey_context import build_journey_context
from app.services.message_service import load_conversation_history
from app.models import LeadershipCoachingSession, JourneyDevelopmentArea
from app.config import OPENAI_API_KEY, OPENAI_MODEL
from app.services.language import normalize_language, response_language_instruction

client = OpenAI(api_key=OPENAI_API_KEY)

# Session phases
PHASES = {
    "SELECTION": "quadrant_selection",
    "SITUATION": "get_situation",
    "REFLECTION": "explore_story",
    "DIAGNOSTICS": "identify_pattern",
    "PLANNING": "design_experiment",
    "CLOSURE": "synthesize_session"
}


def orchestrate_leadership_coaching(
    db: Session,
    user_number: str,
    user_message: str,
    preferred_language: str = "en"
) -> Dict[str, Any]:
    """
    Main orchestration for leadership coaching sessions.
    
    Returns: {
        "response": str,
        "next_phase": str,
        "session_id": int,
        "completed": bool
    }
    """
    
    preferred_language = normalize_language(preferred_language)
    # Check for active session
    active_session = LeadershipCoachingService.get_active_session(db, user_number)
    
    # If no active session, start with quadrant selection
    if not active_session:
        return _handle_selection(db, user_number, user_message, preferred_language)
    
    # Determine current phase from session data
    session_id = active_session.id
    
    if not active_session.situation:
        # Phase: SITUATION
        return _handle_situation(db, session_id, user_number, user_message, active_session.quadrant, preferred_language)
    elif not active_session.reflection:
        # Phase: REFLECTION
        return _handle_reflection(db, session_id, user_number, user_message, active_session, preferred_language)
    elif not active_session.pattern:
        # Phase: DIAGNOSTICS
        return _handle_diagnostics(db, session_id, user_number, user_message, active_session, preferred_language)
    elif not active_session.experiment:
        # Phase: PLANNING
        return _handle_planning(db, session_id, user_number, user_message, active_session, preferred_language)
    else:
        # Phase: CLOSURE
        return _handle_closure(db, session_id, user_number, user_message, active_session, preferred_language)


def _handle_selection(
    db: Session,
    user_number: str,
    user_message: str,
    preferred_language: str = "en"
) -> Dict[str, Any]:
    """Handle quadrant selection"""
    
    print(f"📍 PHASE: QUADRANT SELECTION")
    
    # Check if user selected a quadrant
    quadrant_selected = None
    user_msg_lower = user_message.lower().strip()
    
    # Match by number (1-5)
    if user_msg_lower in ['1', 'one']:
        quadrant_selected = 'vision_goals'
    elif user_msg_lower in ['2', 'two']:
        quadrant_selected = 'people'
    elif user_msg_lower in ['3', 'three']:
        quadrant_selected = 'prioritize_execute'
    elif user_msg_lower in ['4', 'four']:
        quadrant_selected = 'learning_development'
    elif user_msg_lower in ['5', 'five']:
        quadrant_selected = 'time_energy'
    
    # Match by name
    for key, data in LEADERSHIP_QUADRANTS.items():
        if data['name'].lower() in user_msg_lower:
            quadrant_selected = key
            break
    
    if not quadrant_selected:
        # Show selection options
        if preferred_language == "fr":
            response = """Travaillons votre leadership avec le modèle de leadership Alfred.

Sur quelle zone de la roue voulez-vous vous concentrer aujourd'hui ?

1. Vision et objectifs - Votre direction et votre intention
2. Personnes - Diriger, inspirer et développer les autres
3. Prioriser et exécuter - Avancer efficacement
4. Apprentissage et développement - Grandir par l'expérience
5. Temps et énergie - Gérer votre capacité

Répondez avec le numéro ou le nom."""
        else:
            response = """Let's work on your leadership using the Alfred Leadership Model.

Which area of the wheel do you want to focus on today?

1. Vision & Goals - Your direction and purpose
2. People - Leading, inspiring, and developing others  
3. Prioritize & Execute - Getting things done effectively
4. Learning & Development - Growing from experience
5. Time & Energy - Managing your capacity

Reply with the number or name."""
        
        return {
            "response": response,
            "next_phase": "SELECTION",
            "session_id": None,
            "completed": False
        }
    
    # Create session with selected quadrant
    session = LeadershipCoachingService.create_session(db, user_number, quadrant_selected)
    quadrant_info = LEADERSHIP_QUADRANTS[quadrant_selected]
    
    # Build context-based thought starters
    journey_context = build_journey_context(db, user_number)
    thought_starters = _generate_thought_starters(
        quadrant=quadrant_selected,
        journey_context=journey_context,
        preferred_language=preferred_language
    )
    
    response = f"""Great - let's focus on {quadrant_info['name']}.

{thought_starters}

Now, think about this past week. Tell me about a specific moment where something didn't go the way you wanted in this area.

What happened? Give me the situation - a conversation, a decision, a moment where you felt stuck or not at your best."""
    
    return {
        "response": response,
        "next_phase": "SITUATION",
        "session_id": session.id,
        "completed": False
    }


def _handle_situation(
    db: Session,
    session_id: int,
    user_number: str,
    user_message: str,
    quadrant: str,
    preferred_language: str = "en"
) -> Dict[str, Any]:
    """Handle getting the specific situation"""
    
    print(f"📍 PHASE: SITUATION")
    
    # Save the situation
    LeadershipCoachingService.update_session(db, session_id, {
        'situation': user_message
    })
    
    # Generate first reflection question based on what they said
    journey_context = build_journey_context(db, user_number)
    recent_history = load_conversation_history(db, user_number, limit=5)
    
    reflection_question = _generate_reflection_question(
        quadrant=quadrant,
        situation=user_message,
        journey_context=journey_context,
        recent_history=recent_history,
        preferred_language=preferred_language
    )
    
    return {
        "response": reflection_question,
        "next_phase": "REFLECTION",
        "session_id": session_id,
        "completed": False
    }


def _handle_reflection(
    db: Session,
    session_id: int,
    user_number: str,
    user_message: str,
    session: LeadershipCoachingSession,
    preferred_language: str = "en"
) -> Dict[str, Any]:
    """Handle reflection phase - exploring the story"""
    
    print(f"📍 PHASE: REFLECTION")
    
    # Save reflection
    current_reflection = session.reflection or ""
    combined_reflection = f"{current_reflection}\n{user_message}".strip()
    
    LeadershipCoachingService.update_session(db, session_id, {
        'reflection': combined_reflection
    })
    
    # Generate diagnostics question
    journey_context = build_journey_context(db, user_number)
    
    diagnostics_question = _generate_diagnostics_question(
        quadrant=session.quadrant,
        situation=session.situation,
        reflection=combined_reflection,
        journey_context=journey_context,
        preferred_language=preferred_language
    )
    
    return {
        "response": diagnostics_question,
        "next_phase": "DIAGNOSTICS",
        "session_id": session_id,
        "completed": False
    }


def _handle_diagnostics(
    db: Session,
    session_id: int,
    user_number: str,
    user_message: str,
    session: LeadershipCoachingSession,
    preferred_language: str = "en"
) -> Dict[str, Any]:
    """Handle diagnostics phase - identifying the pattern"""
    
    print(f"📍 PHASE: DIAGNOSTICS - Identifying Pattern")
    
    # Extract the pattern from the conversation
    journey_context = build_journey_context(db, user_number)
    
    pattern_analysis = _identify_pattern(
        quadrant=session.quadrant,
        situation=session.situation,
        reflection=session.reflection,
        user_response=user_message,
        journey_context=journey_context,
        preferred_language=preferred_language
    )
    
    # Save pattern and underlying belief
    LeadershipCoachingService.update_session(db, session_id, {
        'pattern': pattern_analysis['pattern'],
        'underlying_belief': pattern_analysis['belief']
    })
    
    # Generate planning question (pass user_message for depth acknowledgment)
    planning_question = _generate_planning_question(
        quadrant=session.quadrant,
        pattern=pattern_analysis['pattern'],
        belief=pattern_analysis['belief'],
        situation=session.situation,
        user_depth=user_message,
        preferred_language=preferred_language  # Pass the user's response for acknowledgment
    )
    
    return {
        "response": planning_question,
        "next_phase": "PLANNING",
        "session_id": session_id,
        "completed": False
    }


def _handle_planning(
    db: Session,
    session_id: int,
    user_number: str,
    user_message: str,
    session: LeadershipCoachingSession,
    preferred_language: str = "en"
) -> Dict[str, Any]:
    """Handle planning phase - designing the experiment"""
    
    print(f"📍 PHASE: PLANNING - Designing Experiment")
    
    # The experiment is already in the session (from the diagnostics phase's planning_question)
    # We need to extract it from the previous conversation, not from user_message
    # user_message here is just their confirmation ("Yes, I'll try that" / "Alex" / etc.)
    
    # Save the user's commitment/context
    LeadershipCoachingService.update_session(db, session_id, {
        'experiment': user_message  # This is their commitment, not the experiment itself
    })
    
    # Generate closure summary
    journey_context = build_journey_context(db, user_number)
    
    closure = _generate_closure_summary(
        quadrant=session.quadrant,
        situation=session.situation,
        reflection=session.reflection,
        pattern=session.pattern,
        belief=session.underlying_belief,
        experiment=user_message,
        journey_context=journey_context,
        preferred_language=preferred_language
    )
    
    # Extract development level from closure
    import re
    level_match = re.search(r'Development Level:\s*(\d)/5', closure)
    development_level = int(level_match.group(1)) if level_match else 3
    
    # Extract the actual experiment description from the closure summary
    # It will be in the "🔬 The Experiment:" line
    experiment_match = re.search(r'🔬 The Experiment:\s*(.+?)(?:\n|$)', closure)
    experiment_description = experiment_match.group(1).strip() if experiment_match else user_message
    
    # Update session with closure data
    LeadershipCoachingService.update_session(db, session_id, {
        'development_level': development_level,
        'practice': experiment_description,  # Use extracted experiment, not user response
        'insights': closure  # Store full closure as insights
    })
    
    # Update journey_development_areas
    try:
        dev_area = JourneyDevelopmentArea(
            user_number=user_number,
            skill=f"{LEADERSHIP_QUADRANTS[session.quadrant]['name']}: {session.pattern[:100]}",
            source=f"Leadership coaching session on {session.session_date.strftime('%Y-%m-%d')}"
        )
        db.add(dev_area)
        db.commit()
        print(f"✅ Added development area from leadership session")
    except Exception as e:
        print(f"⚠️ Could not add development area: {e}")
    
    # Auto-create task for the experiment using the EXTRACTED experiment
    task_created = False
    try:
        from app.models import Task
        from datetime import datetime, timezone
        
        # Create concise task title from experiment
        task_title = f"Leadership: {experiment_description[:60]}"
        
        task = Task(
            user_number=user_number,
            title=task_title,
            notes=f"Quadrant: {LEADERSHIP_QUADRANTS[session.quadrant]['name']}\n\nPattern: {session.pattern}\n\nExperiment: {experiment_description}\n\nContext: {user_message}",
            priority='high',
            status='open',
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc)
        )
        db.add(task)
        db.commit()
        task_created = True
        print(f"✅ Auto-created leadership experiment task: {task_title}")
    except Exception as e:
        print(f"⚠️ Could not auto-create task: {e}")
    
    # Complete the session
    LeadershipCoachingService.complete_session(db, session_id)
    
    # Add task confirmation to response
    if task_created:
        closure += f"\n\n✅ Task created: '{task_title}'"
    
    return {
        "response": closure,
        "next_phase": "COMPLETED",
        "session_id": session_id,
        "completed": True
    }


def _handle_closure(
    db: Session,
    session_id: int,
    user_number: str,
    user_message: str,
    session: LeadershipCoachingSession,
    preferred_language: str = "en"
) -> Dict[str, Any]:
    """Fallback closure handler"""
    return {
        "response": "Séance de coaching leadership terminée. Vous pouvez lancer une nouvelle séance à tout moment !" if preferred_language == "fr" else "Leadership coaching session completed. Start a new session anytime!",
        "next_phase": "COMPLETED",
        "session_id": session_id,
        "completed": True
    }


# ============================================================
# GPT QUESTION GENERATORS - REAL COACHING, NOT QUESTIONNAIRES
# ============================================================

def _generate_thought_starters(
    quadrant: str,
    journey_context: str,
    preferred_language: str = "en"
) -> str:
    """Generate 2-3 context-based thought starters for the selected quadrant"""
    
    quadrant_info = LEADERSHIP_QUADRANTS[quadrant]
    quadrant_name = quadrant_info['name']
    
    system_prompt = f"""You are Alfred, helping a leader reflect on {quadrant_name}.

{response_language_instruction(preferred_language)}

THEIR FULL CONTEXT (goals, projects, strengths, challenges):
{journey_context[:1200]}

Your task: Generate 2-3 brief thought starters that reference THEIR ACTUAL CONTEXT.

CRITICAL: Be SPECIFIC to what you know about them, not generic advice.

EXAMPLES:

BAD (Generic):
• Struggling to maintain energy throughout the day
• Feeling overwhelmed

GOOD (Context-Specific):
• Morning workout routine disrupted despite your goal to stop work at 6pm
• Energy drains from juggling Savencia project with business development
• Recovery squeezed by your "want more" drive after wins

RULES:
- Each thought starter ONE sentence, under 60 chars
- Reference their ACTUAL goals, projects, or patterns
- Total under 200 characters
- Format with "•" bullets

Generate 2-3 thought starters for {quadrant_name} based on their context now."""
    
    messages = [
        {"role": "system", "content": system_prompt}
    ]
    
    resp = client.chat.completions.create(
        model=OPENAI_MODEL,
        messages=messages,
        temperature=0.6,
        max_tokens=120
    )
    
    thought_starters = (resp.choices[0].message.content or "").strip()
    
    if thought_starters:
        return f"Common struggles in this area:\n{thought_starters}"
    else:
        return ""


def _generate_reflection_question(
    quadrant: str,
    situation: str,
    journey_context: str,
    recent_history: List[Dict],
    preferred_language: str = "en"
) -> str:
    """Generate ONE thoughtful reflection question based on the situation"""
    
    quadrant_name = LEADERSHIP_QUADRANTS[quadrant]['name']
    
    system_prompt = f"""You are Alfred, a senior executive coach. The user is working on {quadrant_name} as a leadership development area.

{response_language_instruction(preferred_language)}

They just described this situation: "{situation[:300]}"

Your task: Ask ONE probing question that helps them explore what really happened. Don't ask multiple questions - just one that goes deeper.

CRITICAL RULES:
- Start with brief acknowledgment of what they shared (shows you're listening)
- Then ask ONE specific question that probes deeper
- Focus on THEIR experience, not general concepts
- Make it feel like genuine curiosity, not an interview
- Keep under 280 characters total
- Use their specific language/words when possible

GOOD EXAMPLES:
User: "I gave feedback to Sarah and it went badly..."
Good: "Walk me through it - what did you actually say to her, and how did she react?"
Bad: "What happened?" (too vague)

User: "Board presentation was a disaster, couldn't read the room..."
Good: "What was the first moment you realized you'd lost them - what did you see or feel?"
Bad: "What went wrong?" (too generic)

User: "Team meeting ran 2 hours with no decision..."
Good: "So you watched it unfold for 2 hours. What stopped you from stepping in and making the call?"
Bad: "Why didn't you decide?" (judgmental tone)

Generate your question now: [Brief acknowledgment]. [ONE specific probing question]?"""
    
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": situation}
    ]
    
    resp = client.chat.completions.create(
        model=OPENAI_MODEL,
        messages=messages,
        temperature=0.7,
        max_tokens=100
    )
    
    return (resp.choices[0].message.content or "Tell me more about what happened.").strip()


def _generate_diagnostics_question(
    quadrant: str,
    situation: str,
    reflection: str,
    journey_context: str,
    preferred_language: str = "en"
) -> str:
    """Generate diagnostic question that identifies the PATTERN, not just the problem"""
    
    quadrant_name = LEADERSHIP_QUADRANTS[quadrant]['name']
    
    system_prompt = f"""You are Alfred, a senior executive coach identifying patterns in leadership behavior.

{response_language_instruction(preferred_language)}

CONTEXT:
- Quadrant focus: {quadrant_name}
- Situation: {situation[:200]}
- What they've shared: {reflection[:300]}

Your task: Ask ONE question that helps them see the RECURRING PATTERN, not just this one instance.

This is diagnostics - you're looking for:
- When ELSE does this happen?
- What's the underlying BELIEF driving this?
- What are they AVOIDING or PROTECTING?

CRITICAL RULES:
- Acknowledge the pattern you're seeing (name it explicitly)
- Then ask about where else it shows up or what drives it
- Make it about THEM, not the situation
- Keep under 280 characters

GOOD EXAMPLES:
They said: "I danced around the feedback, said 'some people feel' instead of being direct..."
Good: "So you hid behind 'some people.' When else do you use that move - where else does directness feel risky?"
Bad: "Why didn't you be direct?" (not about pattern)

They said: "Kept trying to get everyone aligned instead of deciding..."
Good: "This sounds familiar - you optimizing for no one upset instead of clear direction. What happens if you disappoint someone?"
Bad: "What's preventing you from deciding?" (too surface)

They said: "Lost the room but didn't course-correct..."
Good: "You SAW the signals but didn't adjust. Is this about not knowing what to do, or not wanting to appear uncertain?"
Bad: "What should you have done?" (solution-focused too early)

Generate your question: [Name the pattern you see]. [Ask where else / what drives it]?"""
    
    messages = [
        {"role": "system", "content": system_prompt}
    ]
    
    resp = client.chat.completions.create(
        model=OPENAI_MODEL,
        messages=messages,
        temperature=0.7,
        max_tokens=120
    )
    
    return (resp.choices[0].message.content or "When else does this pattern show up?").strip()


def _identify_pattern(
    quadrant: str,
    situation: str,
    reflection: str,
    user_response: str,
    journey_context: str,
    preferred_language: str = "en"
) -> Dict[str, str]:
    """Identify the leadership pattern and underlying belief from the conversation"""
    
    quadrant_name = LEADERSHIP_QUADRANTS[quadrant]['name']
    
    system_prompt = f"""You are Alfred, analyzing a leadership coaching conversation.

{response_language_instruction(preferred_language)}

CONTEXT:
- Focus area: {quadrant_name}
- Situation: {situation[:200]}
- Reflection: {reflection[:300]}
- Latest response: {user_response[:300]}

Your task: Identify the PATTERN and UNDERLYING BELIEF.

Return as JSON:
{{
  "pattern": "One sentence describing the recurring behavior pattern",
  "belief": "The core belief or fear driving this pattern"
}}

EXAMPLES:

Input: User avoids giving direct feedback, uses "some people feel" instead
Output:
{{
  "pattern": "Hides behind 'some people' to avoid being the source of difficult truth",
  "belief": "Believes directness damages relationships and makes them the bad guy"
}}

Input: User lets meetings drag without making decisions, seeks consensus
Output:
{{
  "pattern": "Optimizes for everyone feeling heard instead of making timely calls",
  "belief": "Fears being seen as autocratic or not valuing input if they decide without full alignment"
}}

Input: User prepares content but doesn't adapt when presentation isn't landing
Output:
{{
  "pattern": "Delivers prepared content without reading or responding to room dynamics",
  "belief": "Success means having the right answers, not creating connection"
}}

RULES:
- Pattern: Specific behavior, not vague trait
- Belief: What they think will happen if they DON'T do this behavior
- Be direct and honest, not soft
- Maximum 100 characters each

Generate the analysis now as JSON."""
    
    messages = [
        {"role": "system", "content": system_prompt}
    ]
    
    resp = client.chat.completions.create(
        model=OPENAI_MODEL,
        messages=messages,
        temperature=0.5,
        max_tokens=150
    )
    
    try:
        import json
        result_text = resp.choices[0].message.content.strip()
        
        # Clean JSON
        if result_text.startswith("```json"):
            result_text = result_text[7:]
        if result_text.endswith("```"):
            result_text = result_text[:-3]
        result_text = result_text.strip()
        
        return json.loads(result_text)
    except:
        # Fallback
        return {
            "pattern": "Avoids confronting the core issue directly",
            "belief": "Believes addressing it will create conflict or damage relationships"
        }


def _generate_planning_question(
    quadrant: str,
    pattern: str,
    belief: str,
    situation: str,
    user_depth: str = "",
    preferred_language: str = "en"
) -> str:
    """Generate question that designs a behavioral EXPERIMENT"""
    
    quadrant_name = LEADERSHIP_QUADRANTS[quadrant]['name']
    
    # Build context for acknowledgment
    depth_context = ""
    if user_depth and len(user_depth) > 150:
        depth_context = f"\n\nUSER'S DEEP REFLECTION (acknowledge this first):\n{user_depth[:400]}"
    
    system_prompt = f"""You are Alfred, helping design a leadership experiment.

{response_language_instruction(preferred_language)}

CONTEXT:
- Development area: {quadrant_name}
- Pattern identified: {pattern}
- Underlying belief: {belief}
- Original situation: {situation[:200]}{depth_context}

Your task: Help them design a SMALL, SPECIFIC behavioral experiment to test their belief.

CRITICAL INSTRUCTIONS:
1. If user shared deep reflection (multiple beliefs, fears), ACKNOWLEDGE IT FIRST
   - Mirror their insights back ("You're naming two powerful forces...")
   - Show you heard the depth ("Fear of losing what you gained + the addictive pull of more")
   - This builds trust before jumping to solutions
2. Then transition to the micro-experiment
3. Write in NATURAL, CLEAR language - no awkward phrasing

STRUCTURE (when user shared depth):
1. Acknowledge their insight richly (2-3 sentences)
2. Connect pattern to what they revealed
3. Propose ONE tiny, testable micro-experiment  
4. Ask where they'll try it

STRUCTURE (when simple response):
1. State the pattern clearly
2. Connect to consequences
3. Propose micro-experiment
4. Ask where they'll try it

EXAMPLE WITH DEEP ACKNOWLEDGMENT:

Pattern: Success disrupts routines
Belief: Fear of losing gains + addictive pull of winning
User depth: "Two beliefs: 1. Fear of losing what I gained 2. I want more - winning is addictive"

Response: "You're naming two powerful forces at play: the fear of losing what you've built, and the addictive pull of 'I want more.' That's a revealing tension - success itself becomes destabilizing.

What if you anchored to ONE non-negotiable routine as your stability point? Not a full system, just one thing that grounds you regardless of wins or chaos.

Tomorrow morning - which single 10-minute routine would serve as that anchor?"

RULES:
- Keep under 350 characters
- ONE clear micro-experiment
- End with specific implementation question
- Warm, direct tone
- Match depth given with depth returned

Generate your response now."""
    
    messages = [
        {"role": "system", "content": system_prompt}
    ]
    
    resp = client.chat.completions.create(
        model=OPENAI_MODEL,
        messages=messages,
        temperature=0.6,
        max_tokens=220
    )
    
    return (resp.choices[0].message.content or "What's one small experiment you could try?").strip()


def _generate_closure_summary(
    quadrant: str,
    situation: str,
    reflection: str,
    pattern: str,
    belief: str,
    experiment: str,
    journey_context: str,
    preferred_language: str = "en"
) -> str:
    """Generate the final coaching summary"""
    
    quadrant_info = LEADERSHIP_QUADRANTS[quadrant]
    
    system_prompt = f"""You are Alfred, completing a leadership coaching session.

{response_language_instruction(preferred_language)}

SESSION SUMMARY:
- Quadrant: {quadrant_info['name']}
- Situation: {situation[:200]}
- Pattern: {pattern}
- Belief: {belief}
- Experiment: {experiment[:200]}

Your task: Create a powerful closing summary.

FORMAT:
We explored {quadrant_info['name']} through [brief situation recap]:

🧭 Development Area: {quadrant_info['name']}
📊 Development Level: [X]/5 - [One line current state assessment]

🎯 The Pattern: [Restate the behavior pattern concisely]
💡 The Truth: [Challenge/reframe the limiting belief]
🔬 The Experiment: [State the specific behavioral test]

[Optional: Connected insights from their journey/wheel if relevant]

RATING GUIDE:
- 5/5: Mastery - This is a strength, not a development area
- 4/5: Proficient - Doing well, some refinement
- 3/5: Developing - Aware and working on it actively
- 2/5: Struggling - Avoiding or stuck in pattern
- 1/5: Unaware - Don't see the issue yet

EXAMPLES:

Example 1:
We explored People leadership through your feedback conversation:

🧭 Development Area: People (Coach & Delegate)
📊 Development Level: 2/5 - You avoid being direct source of feedback

🎯 The Pattern: You hide behind "some people" because you fear being the bad guy
💡 The Truth: Indirect feedback creates MORE damage (confusion + erodes trust)
🔬 The Experiment: Tell Alex directly - "I need you to limit updates to 2 min"

---

Example 2:
We explored Prioritize & Execute through the 2-hour meeting with no decision:

🧭 Development Area: Prioritize & Execute (Decision Making)
📊 Development Level: 2/5 - You avoid deciding when there's disagreement

🎯 The Pattern: You optimize for everyone feeling heard instead of making timely calls
💡 The Truth: Your consensus-seeking leaves everyone frustrated AND wastes time
🔬 The Experiment: Q1 priorities meeting - 30 min input, then YOUR call

This isn't about being more decisive. It's about redefining 'respect' - they respect clarity, not endless discussion.

RULES:
- Be direct and honest about development level
- Make it punchy and memorable
- Maximum 450 characters
- End with insight if there's room

Generate the summary now."""
    
    messages = [
        {"role": "system", "content": system_prompt}
    ]
    
    resp = client.chat.completions.create(
        model=OPENAI_MODEL,
        messages=messages,
        temperature=0.6,
        max_tokens=250
    )
    
    return (resp.choices[0].message.content or "Leadership coaching session completed.").strip()
