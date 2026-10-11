"""One JSON line per model call in server/logs/model_calls.jsonl."""

from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any

LOG_DIR = Path(__file__).resolve().parents[1] / "logs"


def log_model_call(**fields: Any) -> None:
    """Append a record with provider, model, latency_ms, fallback flag and any extra fields."""
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    record = {"ts": time.strftime("%Y-%m-%dT%H:%M:%S%z"), **fields}
    with (LOG_DIR / "model_calls.jsonl").open("a") as f:
        f.write(json.dumps(record) + "\n")
