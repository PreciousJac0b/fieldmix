"""Deterministic fallback planner, used when the model is unavailable or fails validation twice.

Mirrored in web/src/plan/fallback.ts; both are tested against fixtures/planner_parity.json,
so keep the arithmetic simple (no rounding-mode differences between Python and JS).

Order: acrylic, oil and gouache go top to bottom (background to foreground) in four
horizontal bands, darks first within a band. Watercolor goes light to dark.
"""

from __future__ import annotations

import math

from .schemas import Label, PlanOutput, PlanRequest, Region, Step

TIPS: dict[str, list[str]] = {
    "acrylic": [
        "Acrylic dries fast, so mix enough for the whole shape before you start.",
        "Use the largest brush that fits the shape; save small brushes for the end.",
        "Blend edges while both colors are still wet.",
    ],
    "oil": [
        "Keep early layers thin and later layers thicker (fat over lean).",
        "Use the largest brush that fits the shape; save small brushes for the end.",
        "Wipe your brush between colors to keep mixes clean.",
    ],
    "gouache": [
        "Gouache can dry a little lighter or darker, so test on the canvas edge first.",
        "Keep the paint creamy, not watery, for flat even coverage.",
        "Don't overwork a layer; let it dry before painting on top.",
    ],
    "watercolor": [
        "Let each wash dry before painting right next to it, or the colors will bleed.",
        "Leave the paper bare wherever you want the brightest whites.",
        "Load the brush fully and work quickly to avoid streaks.",
    ],
}


def _hue_deg(region: Region) -> float:
    h = math.degrees(math.atan2(region.lab[2], region.lab[1]))
    return h + 360 if h < 0 else h


def guess_label(region: Region, height: float) -> str:
    """A plain-language label from color and position alone."""
    lightness, a, b = region.lab
    chroma = math.hypot(a, b)
    y_rel = region.centroid[1] / height
    if chroma < 10:
        if lightness > 80:
            return "clouds and highlights" if y_rel < 0.4 else "highlights"
        if lightness < 30:
            return "deep shadows"
        return "soft greys"
    h = _hue_deg(region)
    if 180 <= h < 300:
        if y_rel < 0.45:
            return "pale sky" if lightness > 70 else "sky"
        return "water"
    if 100 <= h < 180:
        return "dark foliage" if lightness < 40 else "foliage"
    if 60 <= h < 100:
        return "light ground" if lightness > 70 else "yellow-green ground"
    if 20 <= h < 60:
        return "warm earth" if lightness < 60 else "sand and light earth"
    return "dark warm accents" if lightness < 40 else "warm accents"


def _order(req: PlanRequest, height: float) -> list[Region]:
    if req.medium == "watercolor":
        return sorted(req.regions, key=lambda r: (-r.lab[0], r.centroid[1], r.id))

    def band(r: Region) -> int:
        return min(3, math.floor(4 * r.centroid[1] / height))

    return sorted(req.regions, key=lambda r: (band(r), r.lab[0], r.id))


def _allocate(total: int, weights: list[float]) -> list[int]:
    """Split `total` minutes by weight (largest remainder), at least 1 each."""
    s = sum(weights) or 1.0
    raw = [total * w / s for w in weights]
    out = [math.floor(x) for x in raw]
    left = total - sum(out)
    by_remainder = sorted(range(len(raw)), key=lambda i: (-(raw[i] - out[i]), i))
    for i in by_remainder[: max(0, left)]:
        out[i] += 1
    return [max(1, m) for m in out]


def fallback_plan(req: PlanRequest) -> PlanOutput:
    """Build a plan without the model: one step per region plus a details step."""
    height = max((r.bbox[1] + r.bbox[3] for r in req.regions), default=1.0) or 1.0
    labels = {r.id: guess_label(r, height) for r in req.regions}
    ordered = _order(req, height)
    tips = TIPS[req.medium]
    watercolor = req.medium == "watercolor"

    add_details = len(ordered) <= 9
    details_minutes = max(1, (req.minutes * 15 + 50) // 100) if add_details else 0
    block_minutes = _allocate(req.minutes - details_minutes, [r.area_pct for r in ordered])

    steps: list[Step] = []
    for i, region in enumerate(ordered):
        label = labels[region.id]
        if watercolor:
            instruction = (
                f"Mix the {label} color shown below with plenty of water. Lay a flat wash over "
                f"region {region.id}, leaving any lighter areas untouched."
            )
        else:
            instruction = (
                f"Mix the {label} color shown below. Block in region {region.id} with broad strokes, "
                "covering the whole shape before refining edges."
            )
        steps.append(
            Step(
                order=i + 1,
                region_ids=[region.id],
                title=f"{label[0].upper()}{label[1:]} (region {region.id})",
                instruction=instruction,
                technique_tip=tips[i % len(tips)],
                est_minutes=block_minutes[i],
            )
        )

    if add_details:
        lightest = max(req.regions, key=lambda r: (r.lab[0], -r.id))
        darkest = min(req.regions, key=lambda r: (r.lab[0], r.id))
        ids = [lightest.id] if lightest.id == darkest.id else [darkest.id, lightest.id]
        steps.append(
            Step(
                order=len(steps) + 1,
                region_ids=ids,
                title="Details and highlights",
                instruction=(
                    "Switch to a small brush. Add the darkest accents first, then the brightest "
                    "highlights. Stop while it still looks fresh."
                ),
                technique_tip="Step back from the canvas every few minutes to judge the whole picture.",
                est_minutes=details_minutes,
            )
        )

    return PlanOutput(labels=[Label(region_id=r.id, label=labels[r.id]) for r in req.regions], steps=steps)
