from __future__ import annotations

from pathlib import Path
from typing import Any

try:
    import yaml
except ImportError as exc:
    raise RuntimeError(
        "PyYAML is required to load synthetic user personas. "
        "Install project requirements first, including PyYAML==6.0.1."
    ) from exc


BASE_DIR = Path(__file__).resolve().parent
PERSONAS_DIR = BASE_DIR / "personas"


def persona_path(persona_name: str) -> Path:
    name = persona_name.strip()
    if not name:
        raise ValueError("Persona name is required.")
    if name.endswith(".yaml") or name.endswith(".yml"):
        path = PERSONAS_DIR / name
    else:
        path = PERSONAS_DIR / f"{name}.yaml"
    if not path.exists():
        available = ", ".join(sorted(item.stem for item in PERSONAS_DIR.glob("*.yaml")))
        raise FileNotFoundError(f"Persona '{persona_name}' was not found. Available personas: {available}")
    return path


def load_persona(persona_name: str) -> dict[str, Any]:
    path = persona_path(persona_name)
    with path.open("r", encoding="utf-8") as handle:
        data = yaml.safe_load(handle) or {}
    if not isinstance(data, dict):
        raise ValueError(f"Persona '{persona_name}' must contain a YAML object.")
    if not data.get("user") or not data["user"].get("email"):
        raise ValueError(f"Persona '{persona_name}' must define user.email.")
    return data


if __name__ == "__main__":
    import argparse
    import json

    parser = argparse.ArgumentParser(description="Load and print a synthetic user persona.")
    parser.add_argument("persona")
    args = parser.parse_args()
    print(json.dumps(load_persona(args.persona), indent=2, default=str))
