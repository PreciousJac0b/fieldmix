"""Regenerate fixtures/planner_parity.json from the Python fallback planner.

Run from server/: .venv/bin/python -m tests.gen_parity
Only regenerate on purpose (when the fallback planner changes), then update the TS port.
"""

from __future__ import annotations

import json
from pathlib import Path

from app.fallback import fallback_plan

from .conftest import make_request

OUT = Path(__file__).resolve().parents[2] / "fixtures" / "planner_parity.json"

CASES = [
    ("acrylic_6_60", "acrylic", 6, 60),
    ("watercolor_6_60", "watercolor", 6, 60),
    ("oil_4_30", "oil", 4, 30),
    ("gouache_10_90", "gouache", 10, 90),
    ("acrylic_1_30", "acrylic", 1, 30),
    ("watercolor_9_90", "watercolor", 9, 90),
    ("acrylic_3_5", "acrylic", 3, 5),
]


def main() -> None:
    cases = []
    for name, medium, n, minutes in CASES:
        req = make_request(medium=medium, n_regions=n, minutes=minutes)
        cases.append({"name": name, "request": req.model_dump(), "expected": fallback_plan(req).model_dump()})
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(cases, indent=1) + "\n")
    print(f"wrote {len(cases)} cases to {OUT}")


if __name__ == "__main__":
    main()
