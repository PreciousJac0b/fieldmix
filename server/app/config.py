"""Settings read from the environment, with a minimal `.env` loader (no python-dotenv)."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]


def load_dotenv(path: Path) -> None:
    """Load KEY=VALUE lines from `path` into os.environ without overriding existing values.

    Supports blank lines, `#` comments (full-line or after whitespace), and optional quotes.
    """
    if not path.is_file():
        return
    for raw in path.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.split(" #", 1)[0].strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        os.environ.setdefault(key, value)


@dataclass(frozen=True)
class Settings:
    """Typed view of the environment variables listed in `.env.example`."""

    llm_provider: str = "ollama"
    ollama_host: str = "http://localhost:11434"
    ollama_model: str = "gemma4:e4b"
    gemini_api_key: str = ""
    gemini_model: str = "gemma-4-26b-a4b-it"
    tts_provider: str = "browser"
    piper_voice_path: str = "./voices/en_US-amy-medium.onnx"
    elevenlabs_api_key: str = ""
    elevenlabs_voice_id: str = ""
    allowed_origins: list[str] = field(default_factory=lambda: ["http://localhost:5173"])

    @classmethod
    def from_env(cls) -> "Settings":
        """Build settings from os.environ, falling back to the defaults above."""
        env = os.environ.get
        origins = env("ALLOWED_ORIGINS", "http://localhost:5173")
        return cls(
            llm_provider=env("LLM_PROVIDER", cls.llm_provider),
            ollama_host=env("OLLAMA_HOST", cls.ollama_host).rstrip("/"),
            ollama_model=env("OLLAMA_MODEL", cls.ollama_model),
            gemini_api_key=env("GEMINI_API_KEY", ""),
            gemini_model=env("GEMINI_MODEL", cls.gemini_model),
            tts_provider=env("TTS_PROVIDER", cls.tts_provider),
            piper_voice_path=env("PIPER_VOICE_PATH", cls.piper_voice_path),
            elevenlabs_api_key=env("ELEVENLABS_API_KEY", ""),
            elevenlabs_voice_id=env("ELEVENLABS_VOICE_ID", ""),
            allowed_origins=[o.strip() for o in origins.split(",") if o.strip()],
        )


def get_settings() -> Settings:
    """Load the repo-root `.env` (if present) and return current settings."""
    load_dotenv(REPO_ROOT / ".env")
    return Settings.from_env()
