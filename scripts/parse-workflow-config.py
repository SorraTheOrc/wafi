#!/usr/bin/env python3
"""
Parse workflow agents YAML config and output JSON for bash consumption.

Usage:
    parse-workflow-config.py [config_path]
    parse-workflow-config.py --defaults

If config_path is omitted, uses WORKFLOW_AGENTS_CONFIG env var or
falls back to config/workflow_agents.yaml relative to repo root.

Output:
    JSON array of agent objects, each with normalized fields:
    - name: string (required)
    - label: string (display name)
    - role: string (waif startWork role)
    - worktree: bool
    - env: dict of env vars
    - idle: dict with task, frequency, variance (or null)
    - is_user: bool

Exit codes:
    0 - success
    1 - config file not found (prints empty array or defaults)
    2 - YAML parse error or validation error
"""

import json
import os
import sys
from pathlib import Path

# Default agents matching current start-workflow-tmux.sh behavior
DEFAULT_AGENTS = [
    {
        "name": "pm",
        "label": "PM agent",
        "role": "pm",
        "worktree": True,
        "env": {"BD_ACTOR": "pm"},
        "idle": {"task": "clear; waif in-progress", "frequency": 30, "variance": 10},
        "is_user": False,
    },
    {
        "name": "design",
        "label": "Design agent",
        "role": "design",
        "worktree": True,
        "env": {"BD_ACTOR": "design"},
        "idle": None,
        "is_user": False,
    },
    {
        "name": "build",
        "label": "Build agent",
        "role": "build",
        "worktree": True,
        "env": {"BD_ACTOR": "build"},
        "idle": None,
        "is_user": False,
    },
    {
        "name": "docs",
        "label": "Doc agent",
        "role": "docs",
        "worktree": True,
        "env": {"BD_ACTOR": "docs"},
        "idle": None,
        "is_user": False,
    },
    {
        "name": "review",
        "label": "Review agent",
        "role": "review",
        "worktree": True,
        "env": {"BD_ACTOR": "review"},
        "idle": None,
        "is_user": False,
    },
    {
        "name": "user",
        "label": "User",
        "role": None,
        "worktree": False,
        "env": {},
        "idle": None,
        "is_user": True,
    },
]


def find_repo_root() -> Path:
    """Find git repo root by walking up from current directory."""
    cwd = Path.cwd()
    for parent in [cwd] + list(cwd.parents):
        if (parent / ".git").exists():
            return parent
    return cwd


def find_config_path(explicit_path: str | None = None) -> Path | None:
    """
    Determine config file path.
    Priority: explicit arg > WORKFLOW_AGENTS_CONFIG env > default location.
    Returns None if file doesn't exist.
    """
    if explicit_path:
        path = Path(explicit_path)
        return path if path.exists() else None

    env_path = os.environ.get("WORKFLOW_AGENTS_CONFIG")
    if env_path:
        path = Path(env_path)
        return path if path.exists() else None

    repo_root = find_repo_root()
    default_path = repo_root / "config" / "workflow_agents.yaml"
    return default_path if default_path.exists() else None


def validate_agent(agent: dict, index: int) -> list[str]:
    """Validate a single agent entry. Returns list of error messages."""
    errors = []

    if not isinstance(agent, dict):
        errors.append(f"Agent {index}: must be a dictionary")
        return errors

    if "name" not in agent:
        errors.append(f"Agent {index}: missing required field 'name'")
    elif not isinstance(agent["name"], str) or not agent["name"].strip():
        errors.append(f"Agent {index}: 'name' must be a non-empty string")

    if "label" in agent and not isinstance(agent.get("label"), str):
        errors.append(
            f"Agent {index} ({agent.get('name', '?')}): 'label' must be a string"
        )

    if (
        "role" in agent
        and agent["role"] is not None
        and not isinstance(agent["role"], str)
    ):
        errors.append(
            f"Agent {index} ({agent.get('name', '?')}): 'role' must be a string or null"
        )

    if "worktree" in agent and not isinstance(agent.get("worktree"), bool):
        errors.append(
            f"Agent {index} ({agent.get('name', '?')}): 'worktree' must be a boolean"
        )

    if "env" in agent:
        env = agent["env"]
        if not isinstance(env, dict):
            errors.append(
                f"Agent {index} ({agent.get('name', '?')}): 'env' must be a dictionary"
            )
        else:
            for k, v in env.items():
                if not isinstance(k, str) or not isinstance(v, (str, int, float, bool)):
                    errors.append(
                        f"Agent {index} ({agent.get('name', '?')}): 'env' values must be strings or primitives"
                    )
                    break

    if "idle" in agent and agent["idle"] is not None:
        idle = agent["idle"]
        if not isinstance(idle, dict):
            errors.append(
                f"Agent {index} ({agent.get('name', '?')}): 'idle' must be a dictionary"
            )
        else:
            if "task" not in idle:
                errors.append(
                    f"Agent {index} ({agent.get('name', '?')}): 'idle.task' is required when 'idle' is specified"
                )
            elif not isinstance(idle["task"], str):
                errors.append(
                    f"Agent {index} ({agent.get('name', '?')}): 'idle.task' must be a string"
                )

            for field in ("frequency", "variance"):
                if field in idle and not isinstance(idle.get(field), int):
                    errors.append(
                        f"Agent {index} ({agent.get('name', '?')}): 'idle.{field}' must be an integer"
                    )

    if "is_user" in agent and not isinstance(agent.get("is_user"), bool):
        errors.append(
            f"Agent {index} ({agent.get('name', '?')}): 'is_user' must be a boolean"
        )

    return errors


def normalize_agent(agent: dict) -> dict:
    """Normalize agent dict to have all expected fields with defaults."""
    name = agent["name"]
    is_user = agent.get("is_user", False)

    # Default worktree: true for agents, false for user pane
    default_worktree = not is_user

    normalized = {
        "name": name,
        "label": agent.get("label", name),
        "role": agent.get("role", name) if not is_user else None,
        "worktree": agent.get("worktree", default_worktree),
        "env": {str(k): str(v) for k, v in agent.get("env", {}).items()},
        "idle": None,
        "is_user": is_user,
    }

    if agent.get("idle"):
        idle = agent["idle"]
        normalized["idle"] = {
            "task": idle["task"],
            "frequency": idle.get("frequency", 30),
            "variance": idle.get("variance", 10),
        }

    return normalized


def parse_config(config_path: Path) -> list[dict]:
    """Parse YAML config and return normalized agent list."""
    try:
        import yaml
    except ImportError:
        print(
            "Error: PyYAML is required. Install with: pip install pyyaml",
            file=sys.stderr,
        )
        sys.exit(2)

    try:
        with open(config_path, "r") as f:
            data = yaml.safe_load(f)
    except yaml.YAMLError as e:
        print(f"Error: Invalid YAML in {config_path}: {e}", file=sys.stderr)
        sys.exit(2)
    except Exception as e:
        print(f"Error: Could not read {config_path}: {e}", file=sys.stderr)
        sys.exit(2)

    if not isinstance(data, dict):
        print(
            f"Error: Config must be a YAML dictionary with 'agents' key",
            file=sys.stderr,
        )
        sys.exit(2)

    if "agents" not in data:
        print(f"Error: Config missing required 'agents' key", file=sys.stderr)
        sys.exit(2)

    agents_raw = data["agents"]
    if not isinstance(agents_raw, list):
        print(f"Error: 'agents' must be a list", file=sys.stderr)
        sys.exit(2)

    if not agents_raw:
        print(f"Error: 'agents' list is empty", file=sys.stderr)
        sys.exit(2)

    # Validate all agents
    all_errors = []
    for i, agent in enumerate(agents_raw):
        all_errors.extend(validate_agent(agent, i))

    if all_errors:
        print("Error: Config validation failed:", file=sys.stderr)
        for err in all_errors:
            print(f"  - {err}", file=sys.stderr)
        sys.exit(2)

    # Check for duplicate names
    names = [a["name"] for a in agents_raw]
    seen = set()
    duplicates = []
    for name in names:
        if name in seen:
            duplicates.append(name)
        seen.add(name)

    if duplicates:
        print(f"Error: Duplicate agent names: {', '.join(duplicates)}", file=sys.stderr)
        sys.exit(2)

    return [normalize_agent(a) for a in agents_raw]


def main():
    # Handle --defaults flag
    if len(sys.argv) > 1 and sys.argv[1] == "--defaults":
        print(json.dumps(DEFAULT_AGENTS, indent=2))
        return

    # Get config path from arg or env/default
    explicit_path = sys.argv[1] if len(sys.argv) > 1 else None
    config_path = find_config_path(explicit_path)

    if config_path is None:
        # Config not found - output defaults
        if explicit_path or os.environ.get("WORKFLOW_AGENTS_CONFIG"):
            # Explicitly specified path doesn't exist - that's an error
            target = explicit_path or os.environ.get("WORKFLOW_AGENTS_CONFIG")
            print(f"Error: Config file not found: {target}", file=sys.stderr)
            sys.exit(1)
        # Default path doesn't exist - use built-in defaults silently
        print(json.dumps(DEFAULT_AGENTS, indent=2))
        return

    agents = parse_config(config_path)
    print(json.dumps(agents, indent=2))


if __name__ == "__main__":
    main()
