"""Color suggestions for outline drawings: validation, normalization, retry, fallback, endpoint."""

from __future__ import annotations

import asyncio
import json

import pytest
from fastapi.testclient import TestClient

from app import main
from app.providers.base import ProviderError, build_suggest_prompt
from app.schemas import SuggestOutput, SuggestRequest
from app.validate import normalize_suggestions, validate_suggestions

from .conftest import FakeProvider


def make_suggest_request(can_lighten: bool = True) -> SuggestRequest:
    return SuggestRequest.model_validate(
        {
            "image_b64": "",
            "can_lighten": can_lighten,
            "palette": [
                {"id": "cad-red", "name": "Cadmium Red Hue", "hex": "#d93a2b"},
                {"id": "ultramarine", "name": "Ultramarine Blue", "hex": "#243b8f"},
                {"id": "burnt-sienna", "name": "Burnt Sienna", "hex": "#8a3b22"},
                {"id": "titanium-white", "name": "Titanium White", "hex": "#f4f3ee"},
            ],
            "shapes": [
                {"number": 1, "area_pct": 40, "centroid": [200, 60], "bbox": [0, 0, 400, 150]},
                {"number": 2, "area_pct": 12, "centroid": [200, 120], "bbox": [120, 40, 160, 120]},
                {"number": 3, "area_pct": 8, "centroid": [200, 260], "bbox": [140, 200, 120, 130]},
            ],
        }
    )


def good_reply() -> str:
    return json.dumps(
        {
            "suggestions": [
                {"number": 1, "paint_id": "ultramarine", "lighten": 3, "reason": "background: pale blue keeps it calm"},
                {"number": 2, "paint_id": "cad-red", "lighten": 0, "reason": "cap: bold red stands out"},
                {"number": 3, "paint_id": "burnt-sienna", "lighten": 1, "reason": "face: warm earth tone"},
            ]
        }
    )


def run(coro):
    return asyncio.run(coro)


def test_valid_suggestions_pass() -> None:
    req = make_suggest_request()
    assert validate_suggestions(SuggestOutput.model_validate_json(good_reply()), req) == []


def test_unknown_paint_missing_and_duplicate_shapes_are_reported() -> None:
    req = make_suggest_request()
    out = SuggestOutput.model_validate(
        {
            "suggestions": [
                {"number": 1, "paint_id": "cobalt-violet", "lighten": 0, "reason": "background"},
                {"number": 1, "paint_id": "cad-red", "lighten": 0, "reason": "again"},
                {"number": 9, "paint_id": "cad-red", "lighten": 0, "reason": "made up"},
            ]
        }
    )
    errors = validate_suggestions(out, req)
    assert any('"cobalt-violet" is not one of the paint ids' in e for e in errors)
    assert any("appears more than once" in e for e in errors)
    assert any("shape 9 does not exist" in e for e in errors)
    assert any("shapes [2, 3] have no color" in e for e in errors)


def test_reasons_may_not_state_amounts_or_foreign_paints() -> None:
    req = make_suggest_request()
    data = json.loads(good_reply())
    data["suggestions"][0]["reason"] = "mix 2 parts Prussian Blue for depth"
    errors = validate_suggestions(SuggestOutput.model_validate(data), req)
    assert any("mixing amount" in e for e in errors)
    assert any('"Prussian Blue"' in e for e in errors)


def test_normalize_maps_names_drops_lighten_without_white_and_trims_reasons() -> None:
    req = make_suggest_request(can_lighten=False)
    data = json.loads(good_reply())
    data["suggestions"][1]["paint_id"] = "Cadmium Red Hue"
    data["suggestions"][2]["reason"] = " ".join(["word"] * 30)
    out = normalize_suggestions(SuggestOutput.model_validate(data), req)
    assert out.suggestions[1].paint_id == "cad-red"
    assert all(s.lighten == 0 for s in out.suggestions)
    assert len(out.suggestions[2].reason.split()) == 16


def test_prompt_lists_paint_ids_and_numbered_shapes() -> None:
    prompt = build_suggest_prompt(make_suggest_request())
    assert "- cad-red: Cadmium Red Hue" in prompt
    assert "- 2: 12% of the drawing" in prompt
    assert "white to lighten with" in prompt
    assert "no white" in build_suggest_prompt(make_suggest_request(can_lighten=False))


def test_retry_then_success_and_fallback_after_two_failures(_logs_to_tmp) -> None:
    req = make_suggest_request()
    bad = json.dumps({"suggestions": [{"number": 1, "paint_id": "cad-red", "lighten": 0, "reason": "x"}]})
    p = FakeProvider([bad, good_reply()])
    res = run(p.suggest_colors(req))
    assert res.source == "gemma" and len(res.suggestions) == 3
    assert "have no color" in p.calls[1][-1].content
    p2 = FakeProvider([bad, bad])
    res2 = run(p2.suggest_colors(req))
    assert res2.source == "fallback" and res2.suggestions == []


def test_transport_error_falls_back_without_retry() -> None:
    p = FakeProvider([ProviderError("connection refused")])
    res = run(p.suggest_colors(make_suggest_request()))
    assert res.source == "fallback" and len(p.calls) == 1


def test_endpoint(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(main, "provider", FakeProvider([good_reply()]))
    body = make_suggest_request().model_dump()
    res = TestClient(main.app).post("/api/suggest-colors", json=body)
    assert res.status_code == 200
    data = res.json()
    assert data["source"] == "gemma"
    assert data["suggestions"][1] == {"number": 2, "paint_id": "cad-red", "lighten": 0, "reason": "cap: bold red stands out"}
