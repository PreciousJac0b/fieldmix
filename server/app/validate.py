"""Checks applied to every model output before it reaches the painter."""

from __future__ import annotations

import re

from .paint_names import foreign_paint_names
from .schemas import Label, PlanOutput, PlanRequest

# Mixing ratios or amounts. Recipes come only from the color engine, never from the model.
RATIO_PATTERN = re.compile(
    r"""
    \b\d+\s*(?:parts?|portions?|drops?|dabs?|scoops?)\b      # "2 parts", "3 dabs"
    | \b\d+\s*:\s*\d+\b                                         # "2:1"
    | \b\d+\s*(?:/|to)\s*\d+\s*(?:ratio|mix)\b                  # "1 to 2 mix"
    | \b(?:one|two|three|four|five|six|seven|eight|half|equal)\s+(?:parts?|portions?|amounts?)\b
    | \b\d+\s*%                                                 # "30%"
    | \b(?:half\s+and\s+half|50\s*/\s*50)\b
    | \bratio\s+of\b
    """,
    re.IGNORECASE | re.VERBOSE,
)


def find_ratio_phrases(text: str) -> list[str]:
    """Return ratio or amount phrases found in `text`."""
    return [m.group(0) for m in RATIO_PATTERN.finditer(text)]


def text_problems(text: str, palette_names: list[str], where: str) -> list[str]:
    """Ratio phrases and foreign paint names in one piece of model text."""
    problems = [f'{where}: states a mixing amount ("{p}"); never give ratios or amounts' for p in find_ratio_phrases(text)]
    problems += [f'{where}: names "{n}", which is not in the palette' for n in foreign_paint_names(text, palette_names)]
    return problems


def validate_plan(out: PlanOutput, req: PlanRequest) -> list[str]:
    """Return a list of problems; empty means the plan is valid.

    Rules (CLAUDE.md Phase 2): every region_id exists, every region appears in at
    least one step, no ratio or amount phrases, no paint names outside the palette.
    """
    errors: list[str] = []
    valid_ids = {r.id for r in req.regions}
    palette_names = [p.name for p in req.palette]

    if not out.steps:
        errors.append("plan has no steps")
    for label in out.labels:
        if label.region_id not in valid_ids:
            errors.append(f"label uses unknown region_id {label.region_id}")
    covered: set[int] = set()
    for step in out.steps:
        for rid in step.region_ids:
            if rid not in valid_ids:
                errors.append(f"step {step.order} uses unknown region_id {rid}")
            covered.add(rid)
        for field in ("title", "instruction", "technique_tip"):
            errors += text_problems(getattr(step, field), palette_names, f"step {step.order} {field}")
    for label in out.labels:
        errors += text_problems(label.label, palette_names, f"label for region {label.region_id}")
    missing = sorted(valid_ids - covered)
    if missing:
        errors.append(f"regions {missing} do not appear in any step; every region must be painted in at least one step")
    return errors


def normalize_plan(out: PlanOutput, req: PlanRequest) -> PlanOutput:
    """Fill gaps that don't need a retry: renumber steps 1..n and label any unlabeled region."""
    labels = {lab.region_id: lab.label.strip() for lab in out.labels if lab.label.strip()}
    for r in req.regions:
        labels.setdefault(r.id, f"Region {r.id}")
    steps = [s.model_copy(update={"order": i + 1, "est_minutes": max(1, s.est_minutes)}) for i, s in enumerate(out.steps)]
    return PlanOutput(
        labels=[Label(region_id=r.id, label=labels[r.id]) for r in req.regions],
        steps=steps,
    )
