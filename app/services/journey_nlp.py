# app/services/journey_nlp.py

import re
from datetime import datetime

# ------------------------------------------------------
# Simple text cleaning
# ------------------------------------------------------

def normalize(text: str):
    return text.lower().strip()


# ------------------------------------------------------
# Strengths extraction
# ------------------------------------------------------

def detect_strengths(msg: str):
    msg_low = normalize(msg)
    triggers = ["my strength", "my strengths", "strengths are", "one of my strengths"]

    if any(t in msg_low for t in triggers):
        # extract everything after "strengths"
        pattern = r"(?:strengths? (?:are|is)\s*)(.*)"
        match = re.search(pattern, msg_low)
        if match:
            raw = match.group(1)
            strengths = [s.strip() for s in raw.replace(".", "").split(",")]
            strengths = [s for s in strengths if s]
            return strengths
    return None


# ------------------------------------------------------
# Goal detection
# ------------------------------------------------------

def detect_goal(msg: str):
    msg_low = normalize(msg)

    if "my goal" in msg_low:
        # Extract phrase after "my goal is"
        pattern = r"my goal(?: is)?\s*(.*)"
        match = re.search(pattern, msg_low)
        if match:
            goal = match.group(1).strip().rstrip(".")
            return goal
    return None


def detect_goal_why(msg: str):
    msg_low = normalize(msg)
    if msg_low.startswith("why:"):
        return msg[4:].strip()
    return None


# ------------------------------------------------------
# Project detection
# ------------------------------------------------------

def detect_project(msg: str):
    msg_low = normalize(msg)
    triggers = ["i am working on", "i'm working on", "my project is", "i have a project"]

    if any(t in msg_low for t in triggers):
        pattern = r"(?:working on|project is|have a project)\s*(.*)"
        match = re.search(pattern, msg_low)
        if match:
            name = match.group(1).strip().rstrip(".")
            return name
    return None


# ------------------------------------------------------
# People detection
# ------------------------------------------------------

def detect_person(msg: str):
    """
    Format expected:
    "Add Marc as a contact — email marc@gmail.com, phone 12345678"
    or:
    "I met a new person: Marc, email..., phone..."
    """

    msg_low = normalize(msg)

    if "add" in msg_low and ("contact" in msg_low or "person" in msg_low):
        # Extract name
        name_match = re.search(r"add\s+([a-zA-Z ]+?)\s+as", msg, re.IGNORECASE)
        email_match = re.search(r"email[: ]+([\w\.-]+@[\w\.-]+)", msg, re.IGNORECASE)
        phone_match = re.search(r"phone[: ]+([\d\-\+ ]+)", msg, re.IGNORECASE)

        if name_match:
            name = name_match.group(1).strip()
            email = email_match.group(1).strip() if email_match else None
            phone = phone_match.group(1).strip() if phone_match else None
            return {"name": name, "email": email, "phone": phone}

    return None


# ------------------------------------------------------
# Failure detection
# ------------------------------------------------------

def detect_failure(msg: str):
    msg_low = normalize(msg)

    if "i failed" in msg_low or "my failure" in msg_low:
        # Extract the event
        pattern = r"(?:i failed|my failure(?: was)?)\s*(.*)"
        match = re.search(pattern, msg_low)
        if match:
            event = match.group(1).strip().rstrip(".")
            return event
    return None


def detect_learning(msg: str):
    msg_low = normalize(msg)
    if msg_low.startswith("learning:"):
        return msg.split(":", 1)[1].strip()
    return None


def detect_scar(msg: str):
    msg_low = normalize(msg)
    if msg_low.startswith("scar:"):
        return msg.split(":", 1)[1].strip()
    return None


# ------------------------------------------------------
# Development area
# ------------------------------------------------------

def detect_development_area(msg: str):
    msg_low = normalize(msg)

    triggers = ["i want to improve", "i want to work on", "i want to develop"]

    if any(t in msg_low for t in triggers):
        pattern = r"(?:improve|work on|develop)\s*(.*)"
        match = re.search(pattern, msg_low)
        if match:
            skill = match.group(1).strip().rstrip(".")
            return skill
    return None
