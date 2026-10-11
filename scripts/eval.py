"""Model eval (the model half of eval/results.md): plan validity and latency.

Sends each saved /api/plan request (from scripts/make_plan_request.ts) to the configured
provider several times, through the same validate → retry → fallback path the API uses.

Usage (from the repo root):
    server/.venv/bin/python scripts/eval.py eval/requests --runs 3
    server/.venv/bin/python scripts/eval.py eval/requests --think       # Gemma thinking on
    server/.venv/bin/python scripts/eval.py eval/requests --out eval/model.md --show 1
"""

from __future__ import annotations

import argparse
import asyncio
import json
import statistics
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "server"))

from app import calllog  # noqa: E402
from app.config import get_settings  # noqa: E402
from app.providers import get_provider, ollama  # noqa: E402
from app.schemas import PlanRequest  # noqa: E402


def percentile(xs: list[float], p: float) -> float:
    """Nearest-rank percentile."""
    s = sorted(xs)
    return s[max(0, min(len(s) - 1, round(p / 100 * len(s) + 0.5) - 1))]


def last_log_record() -> dict:
    lines = (calllog.LOG_DIR / "model_calls.jsonl").read_text().splitlines()
    return json.loads(lines[-1])


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("requests", type=Path, help="directory of request JSON files")
    ap.add_argument("--runs", type=int, default=3)
    ap.add_argument("--think", action="store_true", help="turn Gemma thinking on (Ollama only)")
    ap.add_argument("--out", type=Path)
    ap.add_argument("--show", type=int, default=0, help="print this many full plans")
    args = ap.parse_args()

    ollama.THINK = args.think
    settings = get_settings()
    provider = get_provider(settings)
    files = sorted(args.requests.glob("*.json"))
    if not files:
        sys.exit(f"no request files in {args.requests}")

    lines: list[str] = []

    def log(s: str = "") -> None:
        print(s)
        lines.append(s)

    log("## Gemma planner")
    log()
    log(f"Provider `{provider.name}`, model `{provider.model}`, thinking {'on' if args.think else 'off'}, {args.runs} runs per request.")
    log()
    log("| Request | Run | Source | Attempts | Latency (s) | Steps | Problems on failure |")
    log("| --- | ---: | --- | ---: | ---: | ---: | --- |")
    latencies: list[float] = []
    sources: list[str] = []
    first_try: list[bool] = []
    shown = 0
    for f in files:
        req = PlanRequest.model_validate_json(f.read_text())
        for run in range(1, args.runs + 1):
            t0 = time.perf_counter()
            res = await provider.plan(req)
            dt = time.perf_counter() - t0
            rec = last_log_record()
            latencies.append(dt)
            sources.append(res.source)
            first_try.append(res.source == "gemma" and rec.get("attempts") == 1)
            problems = "; ".join(rec.get("problems", [])[:2]) or rec.get("error", "")
            log(f"| {f.stem} | {run} | {res.source} | {rec.get('attempts')} | {dt:.1f} | {len(res.steps)} | {problems[:120]} |")
            if shown < args.show and res.source == "gemma":
                shown += 1
                print("\n" + res.model_dump_json(indent=1) + "\n")
    n = len(sources)
    valid = sum(s == "gemma" for s in sources)
    log()
    log("| Metric | Value |")
    log("| --- | --- |")
    log(f"| Valid Gemma plans (after at most one retry) | {valid}/{n} ({100 * valid / n:.0f}%) |")
    log(f"| Valid on the first try | {sum(first_try)}/{n} ({100 * sum(first_try) / n:.0f}%) |")
    log(f"| Fallback used | {n - valid}/{n} |")
    log(f"| Latency p50 | {statistics.median(latencies):.1f} s |")
    log(f"| Latency p95 | {percentile(latencies, 95):.1f} s |")
    if args.out:
        args.out.write_text("\n".join(lines) + "\n")


if __name__ == "__main__":
    asyncio.run(main())
