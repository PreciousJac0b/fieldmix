# Eval results

These are the only performance numbers the README and the post quote. Both halves were
run on 2026-10-11 on an Apple Silicon MacBook (24 GB RAM).

**Test images: stand-ins.** The three scenes are macOS's built-in "Big Sur Mountains"
(park), "Big Sur Coastline" (beach) and "Big Sur Road" (street) wallpapers, exported at
768 px. They're Apple's images, so they are not committed. Re-run with your own photos in
`fixtures/scenes/`:

```bash
node scripts/eval.ts --out eval/color.md                         # color half
server/.venv/bin/python scripts/eval.py eval/requests --out eval/model.md   # model half
```

(`scripts/make_plan_request.ts` turns a photo into a saved `/api/plan` request for the
model half.)

## Color engine

Regions: k = 6, 512 px long edge, merge < ΔE00 6, specks < 1% absorbed. Recipes: 1–3 colored paints + white/black, parts 1–6.

| Photo | Palette | Regions | Under ΔE 10 | Median ΔE | Worst ΔE | Solve ms |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| park_standin_big_sur_mountains.jpg | student | 6 | 6/6 (100%) | 2.31 | 9.80 | 16 |
| park_standin_big_sur_mountains.jpg | primaries_wb | 6 | 6/6 (100%) | 3.09 | 6.10 | 4 |
| park_standin_big_sur_mountains.jpg | minimal4 | 6 | 5/6 (83%) | 4.90 | 16.40 | 1 |
| beach_standin_big_sur_coastline.jpg | student | 5 | 5/5 (100%) | 1.94 | 2.97 | 9 |
| beach_standin_big_sur_coastline.jpg | primaries_wb | 5 | 5/5 (100%) | 2.67 | 3.44 | 3 |
| beach_standin_big_sur_coastline.jpg | minimal4 | 5 | 5/5 (100%) | 3.30 | 3.92 | 1 |
| street_standin_big_sur_road.jpg | student | 6 | 5/6 (83%) | 3.01 | 12.66 | 9 |
| street_standin_big_sur_road.jpg | primaries_wb | 6 | 6/6 (100%) | 2.59 | 4.15 | 3 |
| street_standin_big_sur_road.jpg | minimal4 | 6 | 4/6 (67%) | 7.03 | 17.45 | 1 |

| Palette | Regions | Under ΔE 10 | Median ΔE |
| --- | ---: | ---: | ---: |
| student | 17 | 94% | 2.55 |
| primaries_wb | 17 | 100% | 2.67 |
| minimal4 | 17 | 82% | 4.40 |

## Gemma planner

Provider `ollama`, model `gemma4:e4b`, thinking off, 3 runs per request.

| Request | Run | Source | Attempts | Latency (s) | Steps | Problems on failure |
| --- | ---: | --- | ---: | ---: | ---: | --- |
| beach_standin_big_sur_coastline.acrylic | 1 | gemma | 1 | 9.5 | 6 |  |
| beach_standin_big_sur_coastline.acrylic | 2 | gemma | 1 | 6.8 | 7 |  |
| beach_standin_big_sur_coastline.acrylic | 3 | gemma | 1 | 7.8 | 6 |  |
| beach_standin_big_sur_coastline.watercolor | 1 | gemma | 1 | 8.5 | 7 |  |
| beach_standin_big_sur_coastline.watercolor | 2 | gemma | 1 | 5.4 | 6 |  |
| beach_standin_big_sur_coastline.watercolor | 3 | gemma | 1 | 5.8 | 6 |  |
| park_standin_big_sur_mountains.acrylic | 1 | gemma | 1 | 8.4 | 6 |  |
| park_standin_big_sur_mountains.acrylic | 2 | gemma | 1 | 6.6 | 7 |  |
| park_standin_big_sur_mountains.acrylic | 3 | gemma | 1 | 6.4 | 6 |  |
| park_standin_big_sur_mountains.watercolor | 1 | gemma | 1 | 7.1 | 6 |  |
| park_standin_big_sur_mountains.watercolor | 2 | gemma | 1 | 5.9 | 6 |  |
| park_standin_big_sur_mountains.watercolor | 3 | gemma | 1 | 5.8 | 6 |  |
| street_standin_big_sur_road.acrylic | 1 | gemma | 1 | 7.6 | 6 |  |
| street_standin_big_sur_road.acrylic | 2 | gemma | 1 | 6.4 | 6 |  |
| street_standin_big_sur_road.acrylic | 3 | gemma | 1 | 6.6 | 6 |  |
| street_standin_big_sur_road.watercolor | 1 | gemma | 1 | 7.8 | 7 |  |
| street_standin_big_sur_road.watercolor | 2 | gemma | 1 | 5.7 | 6 |  |
| street_standin_big_sur_road.watercolor | 3 | gemma | 1 | 6.4 | 7 |  |

| Metric | Value |
| --- | --- |
| Valid Gemma plans (after at most one retry) | 18/18 (100%) |
| Valid on the first try | 18/18 (100%) |
| Fallback used | 0/18 |
| Latency p50 | 6.6 s |
| Latency p95 | 9.5 s |
