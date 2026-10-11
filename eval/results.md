# Eval results

These are the only performance numbers the README and the post quote. Both halves were
run on 2026-10-11 on an Apple Silicon MacBook (24 GB RAM), on the three photos in
`fixtures/scenes/`: `park.jpg`, `street.jpg` and `beach.jpg` (a lagoon waterfront). They
were taken on the author's phone in soft, low light, so they're mostly greys, dull greens
and near-black foliage shadows.

Re-run:

```bash
node scripts/eval.ts --out eval/color.md
node scripts/make_plan_request.ts --out eval/requests fixtures/scenes/*.jpg                      # acrylic
node scripts/make_plan_request.ts --out eval/requests --medium watercolor fixtures/scenes/*.jpg
server/.venv/bin/python scripts/eval.py eval/requests --runs 3 --out eval/model.md
```

**Where the 4-paint set misses:** the darkest region of every photo (the deepest foliage
shadow, L* 11–17). Without a black or an earth color, yellow + crimson + ultramarine + white
can't get that dark (ΔE 11.6–14.6). The student set reaches ΔE 8.2–8.3 there (OK), and
primaries + white + black get everything under ΔE 10.

**Latency note:** the slowest plan (13.1 s) was the first request, which includes loading
the model. Warm requests took 4.7–9.6 s.

An earlier run on three stand-in landscapes (macOS wallpapers, not committed) gave 94% /
100% / 82% under ΔE 10 and 18/18 valid plans (p50 6.6 s); see `DEVLOG.md`.

## Color engine

Regions: k = 6, 512 px long edge, merge < ΔE00 6, specks < 1% absorbed. Recipes: 1–3 colored paints + white/black, parts 1–6.

| Photo | Palette | Regions | Under ΔE 10 | Median ΔE | Worst ΔE | Solve ms |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| beach.jpg | student | 5 | 5/5 (100%) | 2.68 | 4.85 | 15 |
| beach.jpg | primaries_wb | 5 | 5/5 (100%) | 3.31 | 9.10 | 4 |
| beach.jpg | minimal4 | 5 | 4/5 (80%) | 4.03 | 11.61 | 1 |
| park.jpg | student | 6 | 6/6 (100%) | 3.00 | 8.16 | 9 |
| park.jpg | primaries_wb | 6 | 6/6 (100%) | 3.58 | 8.12 | 3 |
| park.jpg | minimal4 | 6 | 5/6 (83%) | 5.39 | 13.53 | 1 |
| street.jpg | student | 6 | 6/6 (100%) | 2.16 | 8.29 | 9 |
| street.jpg | primaries_wb | 6 | 6/6 (100%) | 2.53 | 4.49 | 3 |
| street.jpg | minimal4 | 6 | 5/6 (83%) | 5.92 | 14.61 | 1 |

| Palette | Regions | Under ΔE 10 | Median ΔE |
| --- | ---: | ---: | ---: |
| student | 17 | 100% | 2.68 |
| primaries_wb | 17 | 100% | 3.21 |
| minimal4 | 17 | 82% | 5.15 |

## Gemma planner

Provider `ollama`, model `gemma4:e4b`, thinking off, 3 runs per request.

| Request | Run | Source | Attempts | Latency (s) | Steps | Problems on failure |
| --- | ---: | --- | ---: | ---: | ---: | --- |
| beach.acrylic | 1 | gemma | 1 | 13.1 | 6 |  |
| beach.acrylic | 2 | gemma | 1 | 5.9 | 6 |  |
| beach.acrylic | 3 | gemma | 1 | 4.7 | 5 |  |
| beach.watercolor | 1 | gemma | 1 | 8.2 | 6 |  |
| beach.watercolor | 2 | gemma | 1 | 5.9 | 5 |  |
| beach.watercolor | 3 | gemma | 1 | 5.7 | 5 |  |
| park.acrylic | 1 | gemma | 1 | 9.6 | 7 |  |
| park.acrylic | 2 | gemma | 1 | 6.5 | 6 |  |
| park.acrylic | 3 | gemma | 1 | 8.2 | 8 |  |
| park.watercolor | 1 | gemma | 1 | 8.1 | 7 |  |
| park.watercolor | 2 | gemma | 1 | 7.0 | 7 |  |
| park.watercolor | 3 | gemma | 1 | 7.5 | 8 |  |
| street.acrylic | 1 | gemma | 1 | 7.0 | 6 |  |
| street.acrylic | 2 | gemma | 1 | 7.2 | 8 |  |
| street.acrylic | 3 | gemma | 1 | 5.7 | 6 |  |
| street.watercolor | 1 | gemma | 1 | 8.6 | 7 |  |
| street.watercolor | 2 | gemma | 1 | 6.5 | 7 |  |
| street.watercolor | 3 | gemma | 1 | 6.3 | 7 |  |

| Metric | Value |
| --- | --- |
| Valid Gemma plans (after at most one retry) | 18/18 (100%) |
| Valid on the first try | 18/18 (100%) |
| Fallback used | 0/18 |
| Latency p50 | 7.0 s |
| Latency p95 | 13.1 s |
