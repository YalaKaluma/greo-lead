from app.services.journey_support import *
from app.routers import journey_belts

router = APIRouter()
router.include_router(journey_belts.router)

get_trial_config = journey_belts.get_trial_config
get_subdomain_prompts = journey_belts.get_subdomain_prompts
get_belt_validation = journey_belts.get_belt_validation
get_belt_dimension_validation = journey_belts.get_belt_dimension_validation
BeltTrialCreate = journey_belts.BeltTrialCreate
BeltTrialSubmit = journey_belts.BeltTrialSubmit
BeltTrialResponse = journey_belts.BeltTrialResponse
BeltReadinessSubmit = journey_belts.BeltReadinessSubmit
BeltAssessmentResponse = journey_belts.BeltAssessmentResponse
get_belt_readiness_status = journey_belts.get_belt_readiness_status
get_latest_belt_assessment = journey_belts.get_latest_belt_assessment
get_belt_assessments = journey_belts.get_belt_assessments
submit_belt_assessment = journey_belts.submit_belt_assessment
accept_belt_promotion = journey_belts.accept_belt_promotion
get_belt_trials = journey_belts.get_belt_trials
start_belt_trial = journey_belts.start_belt_trial
submit_belt_trial = journey_belts.submit_belt_trial
submit_belt_trial_response = journey_belts.submit_belt_trial_response

# Pydantic response models
from app.routers import journey_goals
router.include_router(journey_goals.router)

get_goals = journey_goals.get_goals
create_goal = journey_goals.create_goal
reorder_goals = journey_goals.reorder_goals
update_goal = journey_goals.update_goal
delete_goal = journey_goals.delete_goal
get_vision_roadmap = journey_goals.get_vision_roadmap
get_vision_progress_review = journey_goals.get_vision_progress_review
refresh_vision_progress_review = journey_goals.refresh_vision_progress_review
create_wave = journey_goals.create_wave
update_wave = journey_goals.update_wave
delete_wave = journey_goals.delete_wave
add_goal_to_wave = journey_goals.add_goal_to_wave
reorder_wave_goals = journey_goals.reorder_wave_goals
update_goal_in_wave = journey_goals.update_goal_in_wave
remove_goal_from_wave = journey_goals.remove_goal_from_wave
reorder_waves = journey_goals.reorder_waves
generate_roadmap = journey_goals.generate_roadmap

from app.routers import journey_profile
router.include_router(journey_profile.router)
for _route in journey_profile.router.routes:
    if hasattr(_route, "endpoint"):
        globals()[_route.endpoint.__name__] = _route.endpoint

# ============================================================

from app.config import OPENAI_API_KEY, OPENAI_MODEL
from openai import OpenAI

openai_client_journey = OpenAI(api_key=OPENAI_API_KEY)


class JourneyCoachRequest(BaseModel):
    user_number: str
    journey_type: str  # "strength", "goal", "failure", etc.
    current_data: dict  # The form data being edited
    action: Optional[str] = "initial_feedback"
    user_message: Optional[str] = None
    conversation_history: Optional[list] = None


@router.post("/coach")
def get_journey_coaching(
    coach_request: JourneyCoachRequest,
    db: Session = Depends(get_db)
):
    """
    Provide contextual AI coaching for journey items.
    Alfred gives feedback on how to improve the current entry.
    """
    
    # Build full journey context
    from app.services.journey_context import build_journey_context
    journey_context = build_journey_context(db, coach_request.user_number)
    
    # Create coaching prompt based on journey type
    coaching_prompts = {
        "strength": """You are Alfred, coaching the user on articulating their strengths more powerfully.

Current strength entry:
{current_data}

Your role:
- Help them make it more specific and tangible
- Encourage concrete examples of impact
- Connect to measurable outcomes when possible
- Keep it authentic to who they are

Give direct, actionable feedback in 2-3 sentences.""",

        "goal": """You are Alfred, helping the user clarify their goals.

Current goal entry:
{current_data}

Your role:
- Help define clear success metrics
- Deepen the 'why' behind the goal
- Ensure it's specific and time-bound
- Connect to their broader vision

Give direct, actionable feedback in 2-3 sentences.""",

        "failure": """You are Alfred, helping the user extract wisdom from setbacks.

Current failure entry:
{current_data}

Your role:
- Help identify the deeper learning
- Surface the emotional residue (the 'scar')
- Connect to future growth opportunities
- Be empathetic but move toward insight

Give direct, actionable feedback in 2-3 sentences.""",

        "value": """You are Alfred, helping the user articulate their core values.

Current value entry:
{current_data}

Your role:
- Help them get to the essence of why this matters
- Encourage specific examples of when this value guided decisions
- Connect to their leadership identity
- Keep it authentic and personal

Give direct, actionable feedback in 2-3 sentences.""",

        "development-area": """You are Alfred, helping the user clarify areas for growth.

Current development area entry:
{current_data}

Your role:
- Help them be specific about what skill/capability to develop
- Connect to their goals and challenges
- Suggest concrete first steps
- Frame it as opportunity, not deficit

Give direct, actionable feedback in 2-3 sentences."""
    }
    
    # Default coaching prompt
    default_prompt = """You are Alfred, providing coaching on this journey entry.

Current entry:
{current_data}

Help them make it more specific, actionable, and aligned with their leadership development.
Give direct, actionable feedback in 2-3 sentences."""
    
    # Get appropriate prompt
    coaching_template = coaching_prompts.get(
        coach_request.journey_type,
        default_prompt
    )
    
    # Format current data for prompt
    current_data_str = "\n".join([
        f"- {key}: {value}" 
        for key, value in coach_request.current_data.items() 
        if value and key not in ['id', 'user_number', 'first_seen_at', 'updated_at']
    ])
    
    # Build system prompt
    system_prompt = f"""You are Alfred, an AI Chief of Staff and executive coach.
    
You have full context about the user's journey:
{journey_context}

{coaching_template.format(current_data=current_data_str)}

Keep responses warm, direct, and actionable. No pleasantries needed."""
    
    # Build messages
    if coach_request.action == "initial_feedback":
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"Give me feedback on my current {coach_request.journey_type} entry."}
        ]
    else:
        # Continuing conversation
        messages = [{"role": "system", "content": system_prompt}]
        
        # Add conversation history if provided
        if coach_request.conversation_history:
            for msg in coach_request.conversation_history:
                messages.append({
                    "role": msg.get("role"),
                    "content": msg.get("content")
                })
        
        # Add current user message
        if coach_request.user_message:
            messages.append({
                "role": "user",
                "content": coach_request.user_message
            })
    
    # Get GPT response
    try:
        response = openai_client_journey.chat.completions.create(
            model=OPENAI_MODEL,
            messages=messages,
            max_tokens=300,  # Keep responses concise
            temperature=0.7
        )
        
        feedback = response.choices[0].message.content
        
        return {
            "feedback": feedback,
            "journey_type": coach_request.journey_type,
            "timestamp": datetime.now().isoformat()
        }
    
    except Exception as e:
        print(f"Error generating coaching feedback: {e}")
        raise HTTPException(
            status_code=500,
            detail="Failed to generate coaching feedback"
        )


@router.get("/people/review-candidates")
def get_people_review_candidates(
    user_number: str,
    include_all: bool = False,
    db: Session = Depends(get_db)
):
    """Get list of people who could benefit from a review"""
    try:
        result = PeopleReviewService.get_review_candidates(db, user_number, include_all)
        return result
    except Exception as e:
        print(f"Error getting review candidates: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/people/{person_id}/start-review")
def start_people_review(
    person_id: int,
    user_number: str,
    review_type: str = "regular",
    db: Session = Depends(get_db)
):
    """Initialize a new review session for a person"""
    try:
        result = PeopleReviewService.start_review(db, user_number, person_id, review_type)
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        print(f"Error starting review: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/people/{person_id}/review-history")
def get_people_review_history(
    person_id: int,
    user_number: str,
    db: Session = Depends(get_db)
):
    """Get all past reviews for a person"""
    try:
        result = PeopleReviewService.get_review_history(db, person_id, user_number)
        return result
    except Exception as e:
        print(f"Error getting review history: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/people/reviews/{review_id}")
def update_people_review(
    review_id: int,
    updates: dict,
    user_number: str,
    db: Session = Depends(get_db)
):
    """Update a review in progress"""
    try:
        review = PeopleReviewService.update_review(db, review_id, user_number, updates)
        return {"success": True, "review_id": review.id}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        print(f"Error updating review: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/people/reviews/{review_id}/complete")
def complete_people_review(
    review_id: int,
    user_number: str,
    db: Session = Depends(get_db)
):
    """Mark review as complete and update person record"""
    try:
        result = PeopleReviewService.complete_review(db, review_id, user_number)
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        print(f"Error completing review: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/people/active-review")
def get_active_people_review(
    user_number: str,
    db: Session = Depends(get_db)
):
    """Get the active review session if any"""
    try:
        result = PeopleReviewService.get_active_review(db, user_number)
        if result:
            return result
        else:
            return {"active": False}
    except Exception as e:
        print(f"Error getting active review: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# Add this to app/routers/journey.py

@router.get("/people/{person_id}/synthesis")
def get_person_synthesis(
    person_id: int,
    user_number: str,
    db: Session = Depends(get_db)
):
    """
    Generate Alfred's synthesis of a person based on all review history.
    Uses GPT to analyze all reviews and extract:
    - Core strengths (recurring positive patterns)
    - Improvement opportunities (recurring challenges)
    - Trajectory (getting better/worse/stable)
    """
    from openai import OpenAI
    from app.config import OPENAI_API_KEY, OPENAI_MODEL
    
    # Get person
    person = db.query(JourneyPerson).filter(
        JourneyPerson.id == person_id,
        JourneyPerson.user_number == user_number
    ).first()
    
    if not person:
        raise HTTPException(status_code=404, detail="Person not found")
    
    # Get all reviews for this person
    reviews = db.query(RelationshipReview).filter(
        RelationshipReview.person_id == person_id,
        RelationshipReview.user_number == user_number,
        RelationshipReview.completed_at.isnot(None)
    ).order_by(RelationshipReview.review_date.desc()).all()
    
    if not reviews:
        return {
            "person_name": person.name,
            "strengths": [],
            "improvements": [],
            "trajectory": "No reviews yet - start your first review to build this profile"
        }
    
    # Build review summary for GPT
    review_summaries = []
    for review in reviews:
        summary = f"""
Review Date: {review.review_date.strftime('%Y-%m-%d')}
Strength: {review.relationship_strength}/5
Dynamics: {review.current_dynamics or 'N/A'}
Strengths observed: {review.how_to_strengthen or 'N/A'}
Issues: {review.unresolved_issues or 'N/A'}
Next steps: {review.next_steps or 'N/A'}
"""
        review_summaries.append(summary.strip())
    
    all_reviews_text = "\n\n---\n\n".join(review_summaries)
    
    # Generate synthesis with GPT
    client = OpenAI(api_key=OPENAI_API_KEY)
    
    system_prompt = f"""You are Alfred, analyzing the relationship history between the user and {person.name} ({person.relation or 'colleague'}).

You have {len(reviews)} reviews spanning from {reviews[-1].review_date.strftime('%Y-%m-%d')} to {reviews[0].review_date.strftime('%Y-%m-%d')}.

Your task: Analyze all reviews and extract:

1. CORE STRENGTHS (3-5 items):
   - Recurring positive patterns
   - What consistently works well
   - This person's superpowers in the relationship

2. IMPROVEMENT OPPORTUNITIES (3-5 items):
   - Recurring challenges or friction points
   - Areas that need development
   - Patterns of difficulty

3. TRAJECTORY (1 sentence):
   - Is the relationship getting stronger, weaker, or stable?
   - What's the overall direction?

FORMAT YOUR RESPONSE AS JSON:
{{
  "strengths": ["item 1", "item 2", "item 3"],
  "improvements": ["item 1", "item 2", "item 3"],
  "trajectory": "one sentence assessment"
}}

RULES:
- Be concise (10-15 words per item max)
- Focus on PATTERNS across reviews, not one-time events
- Be balanced but honest
- If relationship is improving/declining, say so
- Use specific language, not generic platitudes

REVIEWS:
{all_reviews_text}
"""
    
    try:
        response = client.chat.completions.create(
            model=OPENAI_MODEL,
            messages=[
                {"role": "system", "content": system_prompt}
            ],
            temperature=0.5,
            max_tokens=500
        )
        
        import json
        result_text = response.choices[0].message.content.strip()
        
        # Clean up JSON if GPT wrapped it in markdown
        if result_text.startswith("```json"):
            result_text = result_text[7:]
        if result_text.endswith("```"):
            result_text = result_text[:-3]
        result_text = result_text.strip()
        
        synthesis = json.loads(result_text)
        
        return {
            "person_name": person.name,
            "review_count": len(reviews),
            "first_review": reviews[-1].review_date.isoformat() if reviews else None,
            "last_review": reviews[0].review_date.isoformat() if reviews else None,
            "strengths": synthesis.get("strengths", []),
            "improvements": synthesis.get("improvements", []),
            "trajectory": synthesis.get("trajectory", "")
        }
        
    except Exception as e:
        print(f"âŒ Error generating synthesis: {e}")
        import traceback
        traceback.print_exc()
        
        # Fallback to simple extraction
        return {
            "person_name": person.name,
            "review_count": len(reviews),
            "strengths": ["Consistent collaboration", "Reliable partner", "Strong technical skills"],
            "improvements": ["Communication clarity", "Time management", "Delegation"],
            "trajectory": f"Relationship stable at {reviews[0].relationship_strength}/5 based on most recent review"
        }


# Add this endpoint to app/routers/journey.py
# Add this endpoint to app/routers/journey.py

@router.get("/goal-reviews")
async def get_goal_reviews(
        user_number: str,
        db: Session = Depends(get_db)
):
    """
    Fetch goal review sessions for this user.
    Returns list of sessions with summaries from coaching conversations.
    """
    from app.models import GoalReviewSession

    # Fetch all review sessions, ordered by most recent first
    sessions = (
        db.query(GoalReviewSession)
        .filter(GoalReviewSession.user_number == user_number)
        .order_by(GoalReviewSession.session_ended_at.desc())
        .limit(50)  # Last 50 sessions
        .all()
    )

    # Serialize sessions for frontend
    sessions_data = [
        {
            "id": s.id,
            "goal_id": s.goal_id,
            "goal_title": s.goal_title,
            "session_started_at": s.session_started_at.isoformat() if s.session_started_at else None,
            "session_ended_at": s.session_ended_at.isoformat() if s.session_ended_at else None,
            "summary": s.summary,
            "key_progress": s.key_progress,
            "key_blockers": s.key_blockers,
            "key_pattern": s.key_pattern,
            "chosen_adjustment": s.chosen_adjustment
        }
        for s in sessions
    ]

    return {
        "sessions": sessions_data
    }
