"""Tests for config loading and GET /api/health."""

from __future__ import annotations

import os
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient

from app import main
from app.config import Settings, load_dotenv


def test_load_dotenv_parses_comments_and_quotes(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    env_file = tmp_path / ".env"
    env_file.write_text(
        "# comment\n"
        "FM_A=hello            # trailing comment\n"
        "FM_B='quoted value'\n"
        "FM_EMPTY=\n"
        "FM_KEEP=from_file\n"
    )
    for key in ("FM_A", "FM_B", "FM_EMPTY"):
        monkeypatch.delenv(key, raising=False)
    monkeypatch.setenv("FM_KEEP", "from_env")
    load_dotenv(env_file)
    assert os.environ["FM_A"] == "hello"
    assert os.environ["FM_B"] == "quoted value"
    assert os.environ["FM_EMPTY"] == ""
    assert os.environ["FM_KEEP"] == "from_env"  # existing env wins


def _fake_ollama(models: list[str]) -> httpx.MockTransport:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/api/tags"
        return httpx.Response(200, json={"models": [{"name": n} for n in models]})

    return httpx.MockTransport(handler)


@pytest.mark.parametrize(
    ("models", "expected"),
    [(["gemma4:e4b"], True), (["gemma4:e2b"], False), ([], False)],
)
def test_health_reports_model_ready(monkeypatch: pytest.MonkeyPatch, models: list[str], expected: bool) -> None:
    transport = _fake_ollama(models)
    real_client = httpx.AsyncClient
    monkeypatch.setattr(main.httpx, "AsyncClient", lambda **kw: real_client(transport=transport, **kw))
    monkeypatch.setattr(main, "settings", Settings(ollama_model="gemma4:e4b"))
    body = TestClient(main.app).get("/api/health").json()
    assert body == {"provider": "ollama", "model": "gemma4:e4b", "tts": "browser", "model_ready": expected}


def test_health_when_ollama_is_down(monkeypatch: pytest.MonkeyPatch) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("connection refused", request=request)

    real_client = httpx.AsyncClient
    transport = httpx.MockTransport(handler)
    monkeypatch.setattr(main.httpx, "AsyncClient", lambda **kw: real_client(transport=transport, **kw))
    monkeypatch.setattr(main, "settings", Settings())
    assert TestClient(main.app).get("/api/health").json()["model_ready"] is False
