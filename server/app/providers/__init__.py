"""Provider selection from settings."""

from __future__ import annotations

from typing import Any

from ..config import Settings
from .base import Message, Provider, ProviderError
from .ollama import OllamaProvider


class UnavailableProvider(Provider):
    """Stand-in when the configured provider can't be used; every call falls back."""

    def __init__(self, name: str, model: str, reason: str) -> None:
        self.name = name
        self.model = model
        self.reason = reason

    async def chat(self, messages: list[Message], schema: dict[str, Any] | None = None) -> str:
        raise ProviderError(self.reason)


def get_provider(settings: Settings) -> Provider:
    """Build the provider named by LLM_PROVIDER."""
    if settings.llm_provider == "gemini":
        # providers/gemini.py is built in Phase 5, after the user supplies GEMINI_API_KEY.
        return UnavailableProvider("gemini", settings.gemini_model, "gemini provider not built yet")
    return OllamaProvider(settings.ollama_host, settings.ollama_model)
