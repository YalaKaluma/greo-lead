"""
Nudge Logging Service

Logs every nudge sent to an Excel file for review and feedback.
Allows systematic prompt tuning based on real-world performance.
"""

import pandas as pd
from datetime import datetime
from pathlib import Path
from typing import Dict, Optional
import logging

logger = logging.getLogger(__name__)

# Log file path - stored in app directory for persistence
NUDGE_LOG_PATH = Path("/app/nudge_feedback_log.xlsx")


def log_nudge(
        nudge_type: str,
        user_number: str,
        message_text: str,
        context_summary: str,
        character_count: int,
        status: str = "success",
        error: Optional[str] = None
) -> None:
    """
    Log a nudge to the Excel file.

    Args:
        nudge_type: Type of nudge (morning/evening/weekly/sunday_review)
        user_number: User's WhatsApp number
        message_text: The actual message sent
        context_summary: Brief summary of context used
        character_count: Length of the message
        status: success or failed
        error: Error message if failed
    """
    try:
        # Create log entry
        log_entry = {
            "Timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S EST"),
            "Nudge Type": nudge_type,
            "User": user_number,
            "Status": status,
            "Message": message_text,
            "Character Count": character_count,
            "Context Summary": context_summary,
            "Error": error if error else "",
            # Empty columns for user feedback
            "Your Rating (1-5)": "",
            "Your Feedback": "",
            "Suggested Improvement": "",
            "Prompt Version": "v1.0"  # Track which prompt version generated this
        }

        # Load existing log or create new
        if NUDGE_LOG_PATH.exists():
            df = pd.read_excel(NUDGE_LOG_PATH)
            df = pd.concat([df, pd.DataFrame([log_entry])], ignore_index=True)
        else:
            df = pd.DataFrame([log_entry])

        # Save to Excel with proper formatting
        with pd.ExcelWriter(NUDGE_LOG_PATH, engine='openpyxl') as writer:
            df.to_excel(writer, index=False, sheet_name='Nudge Log')

            # Get the worksheet
            worksheet = writer.sheets['Nudge Log']

            # Set column widths for readability
            worksheet.column_dimensions['A'].width = 20  # Timestamp
            worksheet.column_dimensions['B'].width = 15  # Nudge Type
            worksheet.column_dimensions['C'].width = 20  # User
            worksheet.column_dimensions['D'].width = 10  # Status
            worksheet.column_dimensions['E'].width = 60  # Message
            worksheet.column_dimensions['F'].width = 12  # Character Count
            worksheet.column_dimensions['G'].width = 40  # Context Summary
            worksheet.column_dimensions['H'].width = 30  # Error
            worksheet.column_dimensions['I'].width = 15  # Rating
            worksheet.column_dimensions['J'].width = 50  # Feedback
            worksheet.column_dimensions['K'].width = 50  # Suggested Improvement
            worksheet.column_dimensions['L'].width = 12  # Prompt Version

            # Make headers bold
            for cell in worksheet[1]:
                cell.font = cell.font.copy(bold=True)

        logger.info(f"✅ Logged {nudge_type} nudge to Excel (total: {len(df)} nudges)")

    except Exception as e:
        # Non-critical - log the error but don't fail the nudge
        logger.warning(f"⚠️ Failed to log nudge to Excel: {e}")


def build_context_summary(journey_context: str, task_context: str, habit_context: str) -> str:
    """
    Build a brief summary of context for logging.

    Args:
        journey_context: Full journey context
        task_context: Full task context
        habit_context: Full habit context

    Returns:
        Brief summary string
    """
    # Count key elements
    goals_count = journey_context.count("GOALS:") if journey_context else 0
    tasks_count = task_context.count("□") if task_context else 0
    habits_count = habit_context.count("○") + habit_context.count("✓") if habit_context else 0

    return f"{goals_count} goals, {tasks_count} tasks, {habits_count} habits"


def get_log_filepath() -> Path:
    """
    Get the path to the nudge log file.

    Returns:
        Path to the Excel file
    """
    return NUDGE_LOG_PATH


def create_summary_report() -> str:
    """
    Create a text summary of nudge performance.

    Returns:
        Formatted summary text
    """
    if not NUDGE_LOG_PATH.exists():
        return "No nudges logged yet."

    try:
        df = pd.read_excel(NUDGE_LOG_PATH)

        # Calculate stats
        total_nudges = len(df)
        by_type = df['Nudge Type'].value_counts().to_dict()
        by_status = df['Status'].value_counts().to_dict()
        avg_chars = df['Character Count'].mean()

        # Count ratings (if any)
        rated_df = df[df['Your Rating (1-5)'].notna()]
        rated_count = len(rated_df)
        if rated_count > 0:
            avg_rating = rated_df['Your Rating (1-5)'].mean()
            rating_text = f"Average Rating: {avg_rating:.1f}/5 ({rated_count} rated)"

            # Show ratings by type
            rating_by_type = rated_df.groupby('Nudge Type')['Your Rating (1-5)'].mean().to_dict()
            rating_details = "\n".join([f"  • {k}: {v:.1f}/5" for k, v in rating_by_type.items()])
        else:
            rating_text = "No ratings yet"
            rating_details = ""

        summary = f"""
📊 NUDGE LOG SUMMARY
===================

Total Nudges Logged: {total_nudges}

By Type:
{chr(10).join([f"  • {k}: {v}" for k, v in by_type.items()])}

By Status:
{chr(10).join([f"  • {k}: {v}" for k, v in by_status.items()])}

Average Characters: {avg_chars:.0f}

{rating_text}
{rating_details if rating_details else ""}

📥 Download the log to add your feedback!
"""

        return summary
    except Exception as e:
        return f"Error generating summary: {e}"