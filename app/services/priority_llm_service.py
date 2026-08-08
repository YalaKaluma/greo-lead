# app/services/priority_llm_service.py
"""
Priority LLM Service: AI-powered task scoring.

Uses GPT-4o to evaluate the absolute move-the-needle value of each task.

Key principles:
- Strategic alignment > urgency
- Leverage > effort
- Cost of delay compounds
- Cognitive weight matters
"""

import json
from typing import List, Dict
from openai import OpenAI
from app.models import Task, TaskPrioritizationContext

# Initialize OpenAI client (assumes OPENAI_API_KEY in environment)
client = OpenAI()


class PriorityLLMService:
    """LLM service specifically for task prioritization."""
    
    def __init__(self):
        self.model = "gpt-4o"  # Use 4o for structured output support
        self.temperature = 0.3  # Lower temp for more consistent scoring
    
    def score_tasks(
        self,
        tasks: List[Task],
        context: TaskPrioritizationContext
    ) -> Dict:
        """
        Score each task's move-the-needle value independently.
        
        Process:
        1. Build system prompt with scoring criteria
        2. Build user prompt with context + tasks
        3. Call GPT-4o with structured output
        4. Parse and validate results
        
        Returns:
            {
                "scores": [{"task_id": ..., "top10_likelihood": ..., ...}],
                "tokens_used": int
            }
        """
        # Build prompts
        system_prompt = self._build_system_prompt()
        user_prompt = self._build_scoring_prompt(tasks, context)
        
        # Call LLM with structured JSON output
        try:
            response = client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                response_format={"type": "json_object"},
                temperature=self.temperature
            )
            
            # Parse response
            result = json.loads(response.choices[0].message.content)
            tokens_used = response.usage.total_tokens
            
            # Validate and enrich scores
            validated_scores = self._validate_scores(result.get("task_scores", []), tasks)
            
            return {
                "scores": validated_scores,
                "tokens_used": tokens_used
            }
            
        except Exception as e:
            raise Exception(f"LLM scoring failed: {str(e)}")
    
    def _build_system_prompt(self) -> str:
        """
        System prompt defining the scoring task.
        
        This is the core of the prioritization intelligence.
        Emphasizes strategic thinking over urgency.
        """
        return """You are an executive prioritization advisor. Assign each task an absolute move-the-needle (MTN) score based only on that task and the user's goals. The score must not change because other tasks are present or absent from the request.

CRITICAL PRINCIPLES:
1. Strategic alignment beats urgency
2. Leverage matters more than effort  
3. Cost of delay compounds
4. Cognitive weight is real (avoidance = signal)
5. Context switching is expensive

SCORING CRITERIA (in order of importance):

1. Strategic Alignment (40%)
   - Does this directly advance a key goal?
   - Is this on the critical path?
   - Would completing this create clarity or momentum?

2. Leverage (30%)
   - Does this unblock other important work?
   - Will this create compounding benefits?
   - Is this a force multiplier?

3. Cost of Delay (20%)
   - What happens if this waits another week?
   - Are there time-sensitive dependencies?
   - Is there reputational or relationship risk?

4. Cognitive State (10%)
   - Is the user avoiding this? (times_postponed is a signal)
   - Does this require deep work vs quick execution?
   - Is this energy-aligned with current state?

WHAT TO DEPRIORITIZE:
- Busy work that feels productive but isn't strategic
- Tasks that can be delegated
- "Someday" items without clear next actions
- Low-leverage optimization tasks

OUTPUT FORMAT (JSON):
{
  "task_scores": [
    {
      "task_id": 123,
      "top10_likelihood": 0.85,
      "primary_reason": "Directly advances Q1 revenue goal and unblocks team",
      "risk_if_ignored": "Delays product launch by 2 weeks, impacts customer commitments",
      "confidence": "high"
    }
  ]
}

ABSOLUTE SCORE ANCHORS:
- 0.85-1.00 Transformation: materially changes an important outcome or creates exceptional leverage
- 0.70-0.84 Strategic: directly advances a key goal or unblocks high-value work
- 0.50-0.69 Important: meaningful progress with limited strategic leverage
- 0.30-0.49 Maintenance: necessary operational work that preserves current performance
- 0.00-0.29 Low Leverage: weak alignment, deferrable, delegable, or unclear value

RULES:
- top10_likelihood is the task's absolute MTN score from 0.00 to 1.00. The field name is retained for API compatibility.
- Apply the anchors consistently. Never curve, rank, normalize, or compare scores against the other tasks in the request.
- primary_reason: Single sentence, specific and actionable
- risk_if_ignored: Concrete cost of delay, not generic
- confidence: "high" (clear), "medium" (some ambiguity), "low" (need more info)

IMPORTANT: Score every task independently. The same task with the same task and goal context must receive the same score whether evaluated alone or in a batch."""

    def _build_scoring_prompt(
        self,
        tasks: List[Task],
        context: TaskPrioritizationContext
    ) -> str:
        """
        Build the user prompt with task and context details.
        
        Provides all the information LLM needs to make informed decisions.
        """
        # Format context
        context_str = self._format_context(context)
        
        # Format tasks
        tasks_str = self._format_tasks(tasks)
        
        prompt = f"""{context_str}

{tasks_str}

Evaluate each task independently and return absolute MTN scores in JSON format as specified in the system prompt."""
        
        return prompt
    
    def _format_context(self, context: TaskPrioritizationContext) -> str:
        """Format context snapshot for LLM."""
        context_str = "CONTEXT SNAPSHOT:\n\n"
        
        # Goals section
        context_str += "Active Goals:\n"
        if context.active_long_term_goals:
            context_str += f"  Visions: {self._format_goals(context.active_long_term_goals)}\n"
        if context.active_short_term_goals:
            context_str += f"  Outcomes: {self._format_goals(context.active_short_term_goals)}\n"
        if context.active_mid_term_goals:
            context_str += f"  Pillars: {self._format_goals(context.active_mid_term_goals)}\n"
        
        if not any([context.active_long_term_goals, context.active_short_term_goals, context.active_mid_term_goals]):
            context_str += "  No active goals defined\n"
        
        # Task metrics
        context_str += f"\nTask Metrics:\n"
        context_str += f"  Total open tasks: {context.total_open_tasks}\n"
        context_str += f"  Current Top 10: {len(context.tasks_in_top10 or [])} tasks\n"
        context_str += f"  Tasks with due dates: {context.tasks_with_due_dates}\n"
        context_str += f"  Overdue tasks: {context.overdue_tasks}\n"
        
        # Temporal context
        context_str += f"\nTemporal Context:\n"
        context_str += f"  Day: {context.day_of_week}\n"
        context_str += f"  Week: {context.week_of_year} of year\n"
        
        # User state
        if context.self_reported_energy:
            context_str += f"\nUser State:\n"
            context_str += f"  Energy level: {context.self_reported_energy}\n"

        feedback_examples = getattr(context, "mtn_feedback_examples", None) or []
        if feedback_examples:
            context_str += "\nRecent user MTN corrections (personal calibration examples):\n"
            for example in feedback_examples:
                title = example.get("title") or "Task"
                context_str += (
                    f"  - {title}: Alfred {example['original_score']:.2f}, "
                    f"user {example['adjusted_score']:.2f} ({example['selected_tag']})"
                )
                if example.get("feedback"):
                    context_str += f" — {example['feedback']}"
                context_str += "\n"
        
        return context_str
    
    def _format_tasks(self, tasks: List[Task]) -> str:
        """Format tasks for LLM evaluation."""
        tasks_str = "TASKS TO EVALUATE:\n\n"
        
        for idx, task in enumerate(tasks, 1):
            task_str = f"Task #{idx}\n"
            task_str += f"  ID: {task.id}\n"
            task_str += f"  Title: {task.title}\n"
            
            if task.notes:
                task_str += f"  Notes: {task.notes}\n"
            
            task_str += f"  Priority: {task.priority or 'Not set'}\n"
            task_str += f"  Due Date: {task.due_date.strftime('%Y-%m-%d') if task.due_date else 'None'}\n"
            task_str += f"  Project: {task.project or 'None'}\n"
            task_str += f"  Linked Goal: {'Goal #' + str(task.goal_id) if task.goal_id else 'None'}\n"
            task_str += f"  Times Postponed: {task.times_postponed or 0}\n"
            task_str += f"  Delegated To: {task.delegated_to or 'Self'}\n"
            task_str += f"  Created: {task.created_at.strftime('%Y-%m-%d') if task.created_at else 'Unknown'}\n"
            task_str += f"  In Current Top 10: {'Yes' if task.in_top10 else 'No'}\n"
            task_str += "\n"
            
            tasks_str += task_str
        
        tasks_str += f"\nTotal tasks to evaluate: {len(tasks)}\n"
        
        return tasks_str
    
    def _format_goals(self, goals: List[Dict]) -> str:
        """Format goals list for context (limit to 3 for brevity)."""
        if not goals:
            return "None"
        
        goal_strs = []
        for g in goals[:3]:  # Limit to top 3
            goal_str = f"\"{g['title']}\""
            if g.get('why'):
                goal_str += f" (Why: {g['why']})"
            goal_strs.append(goal_str)
        
        result = ", ".join(goal_strs)
        if len(goals) > 3:
            result += f" (and {len(goals) - 3} more)"
        
        return result
    
    def _validate_scores(self, scores: List[Dict], tasks: List[Task]) -> List[Dict]:
        """
        Validate and enrich LLM scores.
        
        Ensures:
        - All tasks have scores
        - Scores are in valid range [0.00, 1.00]
        - Required fields are present
        - User_number is attached
        """
        task_ids = {t.id for t in tasks}
        user_number = tasks[0].user_number if tasks else None
        
        validated = []
        scored_ids = set()
        
        for score in scores:
            # Validate task_id
            task_id = score.get("task_id")
            if task_id not in task_ids:
                continue  # Skip invalid task IDs
            
            # Validate score range
            likelihood = float(score.get("top10_likelihood", 0.5))
            likelihood = max(0.0, min(1.0, likelihood))  # Clamp to [0, 1]
            
            # Build validated score
            validated_score = {
                "task_id": task_id,
                "user_number": user_number,
                "top10_likelihood": likelihood,
                "primary_reason": score.get("primary_reason", "No reason provided"),
                "risk_if_ignored": score.get("risk_if_ignored", "Unknown"),
                "confidence": score.get("confidence", "medium")
            }
            
            validated.append(validated_score)
            scored_ids.add(task_id)
        
        # Add default scores for unscored tasks (shouldn't happen, but defensive)
        for task in tasks:
            if task.id not in scored_ids:
                validated.append({
                    "task_id": task.id,
                    "user_number": user_number,
                    "top10_likelihood": 0.5,
                    "primary_reason": "Not evaluated by LLM",
                    "risk_if_ignored": "Unknown",
                    "confidence": "low"
                })
        
        return validated
