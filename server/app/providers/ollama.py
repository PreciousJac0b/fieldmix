"""Local Gemma through Ollama's /api/chat."""

from __future__ import annotations

from typing import Any

import httpx

from .base import Message, Provider, ProviderError

TIMEOUT_S = 120.0
TEMPERATURE = 0.3
# Gemma 4's "thinking" mode is on by default. In the Phase 0 check it took a caption
# from 8.2 s to 1.4 s when off and stopped the model returning several options.
# Off for both plan and ask; set True to compare.
THINK = False


STRUCTURED_UNAVAILABLE = "structured output is unavailable"

# Used when Ollama can't constrain decoding to a schema (seen with Homebrew Ollama 0.40.2:
# its MLX runner ships without the xgrammar library). Validation + retry still apply.
JSON_INSTRUCTIONS = (
    "\n\nRespond with only one JSON object, no markdown fences and no other text, with exactly this shape:\n"
    '{"labels": [{"region_id": <int>, "label": <string>}], '
    '"steps": [{"order": <int>, "region_ids": [<int>], "title": <string>, "instruction": <string>, '
    '"technique_tip": <string>, "est_minutes": <int>}]}'
)


class OllamaProvider(Provider):
    """Calls a local Ollama server. The browser already downscales images to 768 px."""

    name = "ollama"

    def __init__(self, host: str, model: str, client: httpx.AsyncClient | None = None) -> None:
        self.host = host.rstrip("/")
        self.model = model
        self._client = client
        # None until the first schema request tells us whether `format` works.
        self.structured_output: bool | None = None

    async def chat(self, messages: list[Message], schema: dict[str, Any] | None = None) -> str:
        """POST /api/chat, using JSON-schema structured output when the server supports it."""
        if schema is not None and self.structured_output is not False:
            try:
                reply = await self._post(messages, schema)
                self.structured_output = True
                return reply
            except ProviderError as exc:
                if STRUCTURED_UNAVAILABLE not in str(exc):
                    raise
                self.structured_output = False
        if schema is not None:
            messages = [*messages[:-1], Message(messages[-1].role, messages[-1].content + JSON_INSTRUCTIONS, messages[-1].image_b64)]
        return await self._post(messages, None)

    async def _post(self, messages: list[Message], schema: dict[str, Any] | None) -> str:
        payload: dict[str, Any] = {
            "model": self.model,
            "stream": False,
            "think": THINK,
            "options": {"temperature": TEMPERATURE},
            "messages": [
                {"role": m.role, "content": m.content, **({"images": [m.image_b64]} if m.image_b64 else {})}
                for m in messages
            ],
        }
        if schema is not None:
            payload["format"] = schema
        client = self._client or httpx.AsyncClient(timeout=TIMEOUT_S)
        try:
            res = await client.post(f"{self.host}/api/chat", json=payload, timeout=TIMEOUT_S)
            if res.status_code >= 400:
                raise ProviderError(f"ollama: HTTP {res.status_code}: {res.text[:200]}")
            return res.json()["message"]["content"]
        except (httpx.HTTPError, KeyError, ValueError) as exc:
            raise ProviderError(f"ollama: {type(exc).__name__}: {exc}") from exc
        finally:
            if self._client is None:
                await client.aclose()
