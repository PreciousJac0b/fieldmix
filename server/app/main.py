"""Fieldmix backend: model provider switch, TTS, and (from Phase 3) the built PWA."""

from __future__ import annotations

import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import Settings, get_settings
from .providers import Provider, get_provider
from .schemas import AskRequest, AskResponse, PlanRequest, PlanResponse

settings: Settings = get_settings()
provider: Provider = get_provider(settings)

app = FastAPI(title="Fieldmix")
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


async def ollama_model_ready(host: str, model: str) -> bool:
    """Return True if Ollama is reachable and `model` is in its local model list."""
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            res = await client.get(f"{host}/api/tags")
            res.raise_for_status()
    except httpx.HTTPError:
        return False
    names = {m.get("name") for m in res.json().get("models", [])}
    # Ollama reports "name:tag"; an untagged model name means ":latest".
    wanted = model if ":" in model else f"{model}:latest"
    return wanted in names


@app.get("/api/health")
async def health() -> dict[str, object]:
    """Report the active provider, model, TTS engine, and whether the model can be called."""
    if settings.llm_provider == "gemini":
        model, ready = settings.gemini_model, bool(settings.gemini_api_key)
    else:
        model = settings.ollama_model
        ready = await ollama_model_ready(settings.ollama_host, model)
    return {
        "provider": settings.llm_provider,
        "model": model,
        "tts": settings.tts_provider,
        "model_ready": ready,
    }


@app.post("/api/plan")
async def plan(req: PlanRequest) -> PlanResponse:
    """Label regions and order the painting steps (Gemma, or the fallback planner)."""
    return await provider.plan(req)


@app.post("/api/ask")
async def ask(req: AskRequest) -> AskResponse:
    """Answer a mid-session question about the current step."""
    return AskResponse(answer=await provider.ask(req))
