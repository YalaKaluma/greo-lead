from __future__ import annotations

import os
from pathlib import Path
from typing import Any, Dict

import yaml

# Simple in-memory cache to avoid disk reads on every message
_PROMPT_CACHE: Dict[str, Dict[str, Any]] = {}


def load_prompt(prompt_path: str) -> Dict[str, Any]:
    """
    Load a YAML prompt file from disk.

    By default, caches the parsed YAML. To disable caching (useful in dev),
    set PROMPT_CACHE_DISABLED=true in env.
    """
    disable_cache = os.getenv("PROMPT_CACHE_DISABLED", "").lower() in ("1", "true", "yes")
    if (not disable_cache) and prompt_path in _PROMPT_CACHE:
        return _PROMPT_CACHE[prompt_path]

    path = Path(prompt_path)
    if not path.exists():
        raise FileNotFoundError(f"Prompt file not found: {prompt_path}")

    with path.open("r", encoding="utf-8") as f:
        data = yaml.safe_load(f) or {}

    # Basic validation
    if "system_prompt" not in data:
        raise ValueError(f"Prompt file missing required key 'system_prompt': {prompt_path}")
    if "version" not in data:
        data["version"] = "unknown"

    if not disable_cache:
        _PROMPT_CACHE[prompt_path] = data

    return data

def run_prompt(*args, **kwargs):
    return PromptService().run_prompt(*args, **kwargs)