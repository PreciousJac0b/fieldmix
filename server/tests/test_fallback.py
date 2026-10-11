"""Deterministic fallback planner."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.fallback import fallback_plan, guess_label
from app.schemas import PlanRequest
from app.validate import validate_plan

from .conftest import make_request

PARITY = Path(__file__).resolve().parents[2] / "fixtures" / "planner_parity.json"


@pytest.mark.parametrize("n", range(1, 11))
@pytest.mark.parametrize("medium", ["acrylic", "watercolor", "oil", "gouache"])
def test_fallback_is_always_valid(n: int, medium: str) -> None:
    req = make_request(medium=medium, n_regions=n)
    out = fallback_plan(req)
    assert validate_plan(out, req) == []
    assert len(out.labels) == n
    if n >= 4:
        assert 5 <= len(out.steps) <= 10


@pytest.mark.parametrize("minutes", [30, 60, 90])
def test_minutes_add_up(minutes: int) -> None:
    out = fallback_plan(make_request(minutes=minutes))
    assert sum(s.est_minutes for s in out.steps) == minutes


def test_opaque_media_go_top_to_bottom() -> None:
    out = fallback_plan(make_request(medium="acrylic"))
    first_regions = [s.region_ids[0] for s in out.steps[:-1]]
    assert first_regions[0] == 1  # the sky band comes first
    assert first_regions.index(1) < first_regions.index(6)  # sky before foreground shadows


def test_watercolor_goes_light_to_dark() -> None:
    req = make_request(medium="watercolor")
    out = fallback_plan(req)
    lightness = {r.id: r.lab[0] for r in req.regions}
    seq = [lightness[s.region_ids[0]] for s in out.steps[:-1]]
    assert seq == sorted(seq, reverse=True)


def test_labels_use_color_and_position() -> None:
    req = make_request()
    labels = {lab.region_id: lab.label for lab in fallback_plan(req).labels}
    assert labels[1] == "pale sky"
    assert labels[3] == "dark foliage"
    assert labels[6] == "deep shadows"
    water = req.regions[1].model_copy(update={"centroid": (300.0, 350.0)})
    assert guess_label(water, 384) == "water"


def test_matches_parity_fixture() -> None:
    """The TS port (web/src/plan/fallback.ts) is tested against the same file."""
    cases = json.loads(PARITY.read_text())
    assert len(cases) >= 6
    for case in cases:
        req = PlanRequest.model_validate(case["request"])
        assert fallback_plan(req).model_dump() == case["expected"], case["name"]
