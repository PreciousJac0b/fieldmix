"""Shared fixtures: sample requests, a scripted fake provider, and log redirection."""

from __future__ import annotations

import json
from typing import Any

import pytest

from app import calllog
from app.providers.base import Message, Provider, ProviderError
from app.schemas import PlanRequest


@pytest.fixture(autouse=True)
def _logs_to_tmp(tmp_path, monkeypatch: pytest.MonkeyPatch):
    """Keep test runs out of server/logs."""
    monkeypatch.setattr(calllog, "LOG_DIR", tmp_path / "logs")
    return tmp_path / "logs"


def make_request(medium: str = "acrylic", minutes: int = 60, n_regions: int = 6, mode: str = "scene") -> PlanRequest:
    """A plausible landscape: sky on top, hills, trees, grass, path, shadows (512 × 384 image)."""
    base = [
        (1, "#9cc3e6", (77.0, -6.0, -22.0), 30.0, (256, 60), (0, 0, 512, 130)),
        (2, "#5f7f9c", (52.0, -4.0, -18.0), 12.0, (300, 150), (0, 120, 512, 60)),
        (3, "#3e5f2c", (37.0, -20.0, 25.0), 22.0, (150, 230), (0, 170, 300, 120)),
        (4, "#7da24a", (62.0, -25.0, 40.0), 18.0, (380, 300), (250, 230, 262, 154)),
        (5, "#c9b38a", (73.0, 3.0, 22.0), 10.0, (260, 340), (180, 300, 160, 84)),
        (6, "#2a2a24", (17.0, -1.0, 4.0), 8.0, (90, 330), (0, 280, 180, 104)),
        (7, "#e8e4da", (91.0, 0.0, 5.0), 4.0, (420, 40), (360, 10, 120, 60)),
        (8, "#8a4a2a", (40.0, 20.0, 28.0), 3.0, (470, 350), (440, 320, 72, 64)),
        (9, "#4a6a8a", (43.0, -3.0, -20.0), 3.0, (100, 360), (40, 340, 120, 44)),
        (10, "#b0a050", (65.0, -3.0, 45.0), 2.0, (200, 260), (170, 240, 60, 40)),
    ][:n_regions]
    total = sum(b[3] for b in base)
    regions = [
        {"id": i, "hex": h, "lab": list(lab), "area_pct": round(a * 100 / total, 1), "centroid": list(c), "bbox": list(bb)}
        for i, h, lab, a, c, bb in base
    ]
    palette = [
        {"id": "titanium-white", "name": "Titanium White", "hex": "#f4f3ee"},
        {"id": "ultramarine", "name": "Ultramarine Blue", "hex": "#243b8f"},
        {"id": "cad-yellow-light", "name": "Cadmium Yellow Light Hue", "hex": "#f9d71c"},
        {"id": "burnt-sienna", "name": "Burnt Sienna", "hex": "#8a3b22"},
    ]
    recipes = [
        {"region_id": r["id"], "parts": [{"paint_id": "ultramarine", "parts": 1}, {"paint_id": "titanium-white", "parts": 3}], "result_hex": r["hex"], "delta_e": 3.2}
        for r in regions
    ]
    return PlanRequest.model_validate(
        {"image_b64": "", "mode": mode, "medium": medium, "minutes": minutes, "palette": palette, "regions": regions, "recipes": recipes}
    )


def good_plan_json(req: PlanRequest) -> str:
    """A valid model reply covering every region."""
    ids = [r.id for r in req.regions]
    steps = [
        {
            "order": i + 1,
            "region_ids": [rid],
            "title": f"Paint area {rid}",
            "instruction": "Mix the color shown and block in the shape with broad strokes.",
            "technique_tip": "Use a big brush.",
            "est_minutes": max(1, req.minutes // len(ids)),
        }
        for i, rid in enumerate(ids)
    ]
    return json.dumps({"labels": [{"region_id": rid, "label": f"thing {rid}"} for rid in ids], "steps": steps})


class FakeProvider(Provider):
    """Returns scripted replies in order; an Exception in the script is raised instead."""

    name = "fake"
    model = "fake-model"

    def __init__(self, replies: list[Any]) -> None:
        self.replies = list(replies)
        self.calls: list[list[Message]] = []

    async def chat(self, messages: list[Message], schema: dict[str, Any] | None = None) -> str:
        self.calls.append(list(messages))
        reply = self.replies.pop(0)
        if isinstance(reply, Exception):
            raise reply
        return reply


@pytest.fixture
def req() -> PlanRequest:
    return make_request()


__all__ = ["FakeProvider", "ProviderError", "good_plan_json", "make_request"]
