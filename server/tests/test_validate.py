"""Validation rules: region ids, coverage, ratio phrases, foreign paint names."""

from __future__ import annotations

import json

import pytest

from app.paint_names import foreign_paint_names
from app.schemas import PlanOutput
from app.validate import find_ratio_phrases, normalize_plan, validate_plan

from .conftest import good_plan_json


@pytest.mark.parametrize(
    "text",
    [
        "Mix 2 parts blue with 1 part white.",
        "Use a 2:1 mix.",
        "Use equal parts of each.",
        "Add about 30% white.",
        "Go half and half.",
        "A ratio of blue to yellow works.",
        "Add three parts yellow.",
    ],
)
def test_ratio_phrases_are_caught(text: str) -> None:
    assert find_ratio_phrases(text)


@pytest.mark.parametrize(
    "text",
    [
        "Mix the color shown and paint region 3.",
        "Spend about 10 minutes on the sky.",
        "Step 2 builds on step 1.",
        "Add a little more white if it looks dark.",
        "Paint the 3 trees on the left.",
    ],
)
def test_ordinary_text_passes(text: str) -> None:
    assert find_ratio_phrases(text) == []


def test_foreign_paint_names() -> None:
    palette = ["Titanium White", "Ultramarine Blue", "Cadmium Yellow Light Hue"]
    assert foreign_paint_names("Add some Burnt Umber to darken.", palette) == ["Burnt Umber"]
    assert foreign_paint_names("Add a little cadmium yellow and ultramarine.", palette) == []
    assert foreign_paint_names("Use Cadmium Red Light here.", palette) == ["Cadmium Red Light"]
    assert foreign_paint_names("The indigo shadows are lovely.", palette) == []


def test_good_plan_has_no_problems(req) -> None:
    out = PlanOutput.model_validate_json(good_plan_json(req))
    assert validate_plan(out, req) == []


def test_unknown_and_missing_regions_are_reported(req) -> None:
    data = json.loads(good_plan_json(req))
    data["steps"][0]["region_ids"] = [99]
    errors = validate_plan(PlanOutput.model_validate(data), req)
    assert any("unknown region_id 99" in e for e in errors)
    assert any("regions [1]" in e for e in errors)


def test_ratio_and_foreign_paint_in_plan_text(req) -> None:
    data = json.loads(good_plan_json(req))
    data["steps"][1]["instruction"] = "Mix 2 parts Ultramarine Blue with Burnt Umber."
    errors = validate_plan(PlanOutput.model_validate(data), req)
    assert any("mixing amount" in e for e in errors)
    assert any('"Burnt Umber"' in e for e in errors)


def test_normalize_renumbers_and_fills_labels(req) -> None:
    data = json.loads(good_plan_json(req))
    data["labels"] = data["labels"][:2]
    for s in data["steps"]:
        s["order"] = s["order"] * 10
    out = normalize_plan(PlanOutput.model_validate(data), req)
    assert [s.order for s in out.steps] == list(range(1, len(req.regions) + 1))
    assert [lab.region_id for lab in out.labels] == [r.id for r in req.regions]
    assert out.labels[5].label == "Region 6"
