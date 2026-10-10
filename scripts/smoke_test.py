"""Phase 0 smoke test: send one landscape JPEG to Gemma via Ollama /api/chat and print the caption.

Usage (from the repo root):
    server/.venv/bin/python scripts/smoke_test.py fixtures/scenes/park.jpg
"""

from __future__ import annotations

import base64
import sys
import time
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "server"))
from app.config import get_settings  # noqa: E402


def main() -> int:
    """Caption the image given on the command line and print the latency."""
    if len(sys.argv) != 2:
        print(__doc__)
        return 2
    image = Path(sys.argv[1])
    settings = get_settings()
    payload = {
        "model": settings.ollama_model,
        "stream": False,
        "messages": [
            {
                "role": "user",
                "content": "Describe this scene in one or two sentences, as a painter would.",
                "images": [base64.b64encode(image.read_bytes()).decode()],
            }
        ],
    }
    start = time.perf_counter()
    res = httpx.post(f"{settings.ollama_host}/api/chat", json=payload, timeout=180.0)
    res.raise_for_status()
    elapsed = time.perf_counter() - start
    print(f"model:   {settings.ollama_model}")
    print(f"latency: {elapsed:.1f} s")
    print(f"caption: {res.json()['message']['content'].strip()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
