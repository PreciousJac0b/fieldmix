"""HTTP endpoints and the Ollama request shape (both with mocks; no model needed)."""

from __future__ import annotations

import asyncio
import json

import httpx
import pytest
from fastapi.testclient import TestClient

from app import main
from app.providers.base import Message, ProviderError
from app.providers.ollama import OllamaProvider, schema_shape
from app.schemas import PlanOutput, SuggestOutput

from .conftest import FakeProvider, good_plan_json


def test_post_plan_matches_contract(req, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(main, "provider", FakeProvider([good_plan_json(req)]))
    res = TestClient(main.app).post("/api/plan", json=req.model_dump())
    assert res.status_code == 200
    body = res.json()
    assert set(body) == {"labels", "steps", "source"}
    assert body["source"] == "gemma"
    assert set(body["steps"][0]) == {"order", "region_ids", "title", "instruction", "technique_tip", "est_minutes"}
    assert set(body["labels"][0]) == {"region_id", "label"}


def test_post_plan_rejects_bad_input(req) -> None:
    data = req.model_dump()
    data["medium"] = "crayon"
    assert TestClient(main.app).post("/api/plan", json=data).status_code == 422


def test_post_plan_ignores_extra_region_fields(req, monkeypatch: pytest.MonkeyPatch) -> None:
    """The browser sends label_point too; it must not break the request."""
    monkeypatch.setattr(main, "provider", FakeProvider([good_plan_json(req)]))
    data = req.model_dump()
    for r in data["regions"]:
        r["label_point"] = [1, 2]
    assert TestClient(main.app).post("/api/plan", json=data).status_code == 200


def test_post_ask(req, monkeypatch: pytest.MonkeyPatch) -> None:
    plan = {**json.loads(good_plan_json(req)), "source": "gemma"}
    monkeypatch.setattr(main, "provider", FakeProvider(["Keep the edges soft for now."]))
    res = TestClient(main.app).post("/api/ask", json={"question": "Edges?", "plan": plan, "current_step": 1})
    assert res.status_code == 200
    assert res.json() == {"answer": "Keep the edges soft for now."}


def test_ollama_payload_shape() -> None:
    seen: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen.update(json.loads(request.content))
        assert request.url.path == "/api/chat"
        return httpx.Response(200, json={"message": {"role": "assistant", "content": "{}"}})

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    provider = OllamaProvider("http://ollama.test", "gemma4:e4b", client=client)
    schema = {"type": "object"}
    out = asyncio.run(provider.chat([Message("system", "sys"), Message("user", "hi", "aW1n")], schema))
    assert out == "{}"
    assert seen["model"] == "gemma4:e4b"
    assert seen["stream"] is False and seen["think"] is False
    assert seen["options"] == {"temperature": 0.3}
    assert seen["format"] == schema
    assert seen["messages"][0] == {"role": "system", "content": "sys"}
    assert seen["messages"][1] == {"role": "user", "content": "hi", "images": ["aW1n"]}


def test_ollama_errors_become_provider_errors() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500, text="boom")

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    provider = OllamaProvider("http://ollama.test", "gemma4:e4b", client=client)
    with pytest.raises(ProviderError):
        asyncio.run(provider.chat([Message("user", "hi")]))


def test_ollama_falls_back_to_prompted_json_when_structured_output_is_unavailable() -> None:
    bodies: list[dict] = []

    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        bodies.append(body)
        if "format" in body:
            return httpx.Response(501, json={"error": "structured output is unavailable"})
        return httpx.Response(200, json={"message": {"role": "assistant", "content": "{}"}})

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    provider = OllamaProvider("http://ollama.test", "gemma4:e4b", client=client)
    msgs = [Message("system", "sys"), Message("user", "plan this", "aW1n")]
    assert asyncio.run(provider.chat(msgs, PlanOutput.model_json_schema())) == "{}"
    assert provider.structured_output is False
    assert "format" not in bodies[1]
    assert bodies[1]["messages"][1]["content"].startswith("plan this")
    assert '"region_ids"' in bodies[1]["messages"][1]["content"]
    assert bodies[1]["messages"][1]["images"] == ["aW1n"]
    # Remembered: the next schema call skips straight to prompted JSON.
    asyncio.run(provider.chat(msgs, PlanOutput.model_json_schema()))
    assert len(bodies) == 3 and "format" not in bodies[2]


def test_ollama_other_errors_are_not_masked() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(404, json={"error": "model 'gemma4:e4b' not found"})

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    provider = OllamaProvider("http://ollama.test", "gemma4:e4b", client=client)
    with pytest.raises(ProviderError, match="not found"):
        asyncio.run(provider.chat([Message("user", "hi")], {"type": "object"}))
    assert provider.structured_output is None


def test_schema_shape_templates_any_response_model() -> None:
    assert schema_shape(SuggestOutput.model_json_schema()) == (
        '{"suggestions": [{"number": <int>, "paint_id": <string>, "lighten": 0 | 1 | 3, "reason": <string>}]}'
    )
    assert '"region_ids": [<int>]' in schema_shape(PlanOutput.model_json_schema())
