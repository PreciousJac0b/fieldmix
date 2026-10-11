# Fieldmix dev log

## 2026-10-10 — Spec review and Phase 0 (setup)

**Spec review.** Read `CLAUDE.md` end to end and flagged 23 problems before writing code. The biggest:
- The core principle said Gemma should "repeat the recipes exactly", but the plan prompt said "never state ratios". Resolved: Gemma never states ratios; recipes are inserted by a template, and a ratio check rejects any model output that includes one.
- The eval was specified in Python, but the color engine is TypeScript. Split into `eval.ts` (color metrics, run on Node 24) and `eval.py` (model metrics).
- The recipe search as written (3 of 12 paints, parts 1 to 6, optional white and black) is about 2.3 M spectral mixes per region. Capped at 4 components, GCD-deduplicated, with hue-bracket pruning instead of "nearest paints" (blue and yellow are both far from green).
- Plain-HTTP LAN pages aren't a secure context on the phone, so Wake Lock, service workers and PWA install fail. Handled with Chrome's insecure-origin flag plus a looping-video wake-lock fallback.
All fixes are recorded in the spec changelog.

**Built.**
- git repo, MIT `LICENSE`, `.gitignore` (`.env`, `voices/`, `node_modules/`, `__pycache__/`, `server/logs/`, `.venv/`, `web/dist/`), `.env.example`.
- `web/`: Vite 8 + TypeScript 6 (vanilla), with Vitest 5, culori 4.0.2 and spectral.js 3.0.0 pinned exactly. Vite listens on the LAN and proxies `/api` to FastAPI, so the phone stays same-origin.
- `server/`: Python 3.12 venv, FastAPI 0.143, uvicorn 0.54, httpx 0.28, google-genai 2.29, pytest 9.1 (full freeze in `requirements.txt`). A small `.env` loader in `config.py` avoids adding python-dotenv.
- `GET /api/health` checks Ollama's `/api/tags` for the configured model.
- `scripts/dev.sh` (backend on :8000, Vite on :5173, prints the phone URL), `scripts/pull_model.sh`, `scripts/smoke_test.py`.

**What broke / notes.**
- Ollama wasn't installed. The user installed Ollama 0.40.2 with Homebrew and started it as a service.
- The first `ollama pull gemma4:e4b` stalled at 26% (2.5 of 9.5 GB) with a network drop. My output filter hid the non-zero exit code. A re-run resumed from the partial download and finished.
- Starlette warns that using `httpx` with its TestClient is deprecated in favor of `httpx2`. Left as is for now (switching would be a new dependency).
- culori ships no TypeScript types. Plan: a small local `.d.ts` for the functions we use, rather than adding `@types/culori`.
- TypeScript itself is Apache-2.0, not MIT as the stack table implies for the frontend. It's a dev-only tool, so the repo license is unaffected.

**Model (confirmed with `ollama list` / `ollama show`).** `gemma4:e4b`, 9.5 GB, 8.1B parameters, nvfp4 quantization, 128K context, Apache 2.0. Capabilities: vision, audio, tools, thinking (on by default). Defaults: temperature 1, top_k 64, top_p 0.95.

**Smoke test.** For a stand-in landscape (macOS's built-in "Big Sur Coastline" wallpaper at 768 px, used locally and not committed), the caption was:
> A turbulent canvas of maritime blues and craggy neutrals is softened by a blush of intense crimson along the coastal slope, where sun-bleached rock meets the sea's milky tranquility.

That took 11.4 s cold (including model load) and 8.3 s warm. `/api/health` against the live Ollama returns `model_ready: true`.

**Finding: thinking mode.** Same image and prompt, temperature 0.3, one run each:
- `think: true` (the default): 8.2 s, 720 output tokens. It also returned three "Option" captions instead of the one asked for.
- `think: false`: 1.4 s, 60 output tokens, one clean caption.

This was one run on one image, not a benchmark, but it's a big enough difference to propose `think: false` for the plan and ask calls in Phase 2.

## 2026-10-10 — Phase 1: Color engine (no AI)

**Built** (all in `web/src/color/`, running in the browser):
- `lab.ts`: sRGB ↔ CIELAB (D65) and CIEDE2000 via culori, plus fast bulk paths (a pixel lookup table, inline XYZ → Lab) that tests check against culori.
- `kmeans.ts`: k-means++ with a seeded mulberry32 RNG and max 20 iterations. It fits on a 20k-pixel sample, assigns every pixel, and drops empty clusters.
- `regions.ts`:
  - pipeline: k-means → greedy merge of the closest pair while ΔE00 < 6 → absorb clusters under 1% into the nearest cluster by color;
  - output: regions sorted by area with id, hex, Lab, area %, centroid, bbox and a label anchor (the member pixel nearest the centroid);
  - also a label map, an outline mask and a canvas overlay that draws the region numbers.
- `swatches.ts`: per-channel median sampling (15 × 15 for swatches, 5 × 5 for the eyedropper) and white balance in linear light so paper ends up at sRGB 245.
- `mix.ts`: `mixPaints` is the thin wrapper over `spectral.mix`. `MixKernel` is the fast path for the search.
- `paints.ts`: the preset paints and the three eval palettes.
- `recipes.ts` + `recipes.worker.ts` + `solver.ts`: the brute-force search, run in a Web Worker.
- `adjust.ts`: eyedropper, rule-based tips, and the test-dab re-solve.
- `web/dev.html`: the debug page. `scripts/eval.ts` is the color half of the eval (macOS `sips` decodes the images; Node 24 runs it as TypeScript directly).

**Reading the real spectral.js 3.0 API.** It's a UMD bundle, `mix([Color, factor], …)` takes `Color` objects, and factors are normalized. Each pigment's effective concentration is **factor² × tintingStrength² × luminance**, so "2 parts" weighs 4× before the luminance term. I kept the library's model as is and treated recipe parts as its factors, which is how the README uses whole numbers. This is a modeling assumption worth stating in the post.

**The search-speed problem and the fix.** A region search over 3 of 12 paints with parts 1–6 plus white and black is about 740k mixes. At about 2 µs per `spectral.mix` call (each builds a `Color` object), that's around 1.5 s *per region*. Two changes fixed it:
1. Mix results don't depend on the target, so every candidate is mixed **once per palette** and all regions are matched against that list. A CIE76 prefilter keeps the 48 nearest, then CIEDE2000 ranks them.
2. `MixKernel` recomputes spectral.js's formula using spectral.js's own per-paint K/S curves and luminance, plus its 3 × 38 color-matching matrix, read from the library by feeding it unit reflectance curves. A parity test checks 500 random recipes against `spectral.mix` to 1e-9 in Lab.

Equivalent ratios are removed with a GCD check (2:2 = 1:1). Palettes with more than 12 colored paints switch to a per-region search over the paints whose hues bracket the target, plus the nearest few.

**What broke.** 3 of the first 68 tests failed, and each was my expectation, not the code:
- I hand-computed a white-balance value wrong (sRGB 100 under a 1.581 linear gain is 124, not 126).
- I assumed Alizarin was the darkest preset; Phthalo Blue is darker.
- "Too dark" on pure Ultramarine suggested Cadmium Red instead of White. This one exposed a real weakness: scoring by plain ΔE to a shifted goal treats a hue change the same as overshooting lightness. I replaced it with a weighted score:
  - missing the requested amount: ×0.5 (the painter can add a bit less);
  - drifting on the other lightness/chroma axis: ×1;
  - hue drift: ×2.
  A new test checks that "too dark" on a blue tint now suggests white.

**Results.**
- 69/69 Vitest tests pass, and the typecheck is clean.
- All 13 Sharma CIEDE2000 pairs are within 0.0001, including the hue-wraparound pairs.
- Synthetic 4-color image at k = 6 → 4 regions, each within ΔE00 2 of its source.
- Blue + yellow lands at hue 139.9° (spectral.js README colors), and stays between 90° and 180° for the preset Ultramarine + Cadmium Yellow Light Hue at 1:1, 1:2 and 2:1.
- Every feedback button has a test that checks the direction of the change, plus a test for the "no single-part fix" case.
- Speed in Chrome (Web Worker, unthrottled):
  - eval palettes: 1–3 ms once cached;
  - all 19 presets: 233 ms for 6 regions and 349 ms for 9.
  - In Node, 10 regions × 12 paints takes under 750 ms by test.
  - I couldn't apply Chrome's 4× CPU throttle from this environment, so the throttled figure (about 1.4 s worst case) is an estimate, not a measurement.
- **Provisional** fixture check, on three macOS built-in landscape wallpapers (stand-ins until the real fixture photos arrive, so not quotable): student palette 94% of regions under ΔE 10 (17/18, median 1.20); primaries + white + black 100% (median 1.73); minimal 4-paint set 89% (median 3.30). The misses are dark neutrals (asphalt, shadow) with no black in the palette.

## 2026-10-11 — Phase 2: Gemma planner backend

**Built** (`server/app/`):
- `schemas.py`: pydantic models matching the API contract, plus `PlanOutput` (labels + steps only), whose JSON schema is what the model gets. `source` is added by the server.
- `providers/base.py`: the `Provider` interface (`plan`, `ask`) with the shared flow: build the prompt → call → parse → validate → on failure retry once with the problems appended → else fallback. Concrete providers only implement `chat()`.
- `providers/ollama.py`: `/api/chat`, temperature 0.3, 120 s timeout, `think: false`.
- `validate.py` and `paint_names.py`: every region_id exists; every region is painted in at least one step; no ratio or amount phrases ("2 parts", "2:1", "equal parts", "30%", "half and half"); no paint names from a list of about 45 common ones unless they're in the palette (mentions like "cadmium yellow" are fine when the palette has "Cadmium Yellow Light Hue").
- `fallback.py`: deterministic planner.
  - Opaque media go top to bottom in four bands, darks first within a band; watercolor goes light to dark.
  - Labels come from color and position.
  - One step per region plus a details step; minutes are split by area with integer arithmetic only, so the TS port can match exactly.
  - `fixtures/planner_parity.json` (7 cases) is the shared reference.
- `prompts/plan.md` and `prompts/ask.md` contain every rule the spec requires. The model gets each region's hex, lightness, area and position, and which paints its recipe uses, **but never the amounts**, so it has nothing to repeat.
- `/api/ask`: under 80 words (trimmed at a sentence boundary), photo optional, ratio check, retry once, then a safe canned answer.
- `calllog.py`: one JSON line per call (provider, model, latency_ms, attempts, fallback, structured_output, and the problems plus raw replies on failure).
- `scripts/make_plan_request.ts` builds real `/api/plan` bodies from a photo using the TS color engine. `scripts/eval.py` is the model half of the eval.

**What broke, and the fixes.**
1. **Ollama's structured output isn't available here.** Every call came back HTTP 501 `{"error":"structured output is unavailable"}`, even for `format: "json"`. Ollama's log showed why: this model runs on the MLX engine, and Homebrew's Ollama 0.40.2 bottle doesn't include `libollama_xgrammar.dylib`. The spec assumed `format` works. Fix: when Ollama reports this, the provider resends without `format`, with the JSON shape in the prompt, and remembers that for the session. Validation, retry and fallback still guard the output. The official Ollama app may include xgrammar (not checked).
2. **Unconstrained JSON slips.** In two of the early runs, both attempts failed:
   - one reply had an extra `}` at the end;
   - one closed the object right after `labels` (`…}]}, "steps": [ … ]}`). Logging the raw reply showed the retry returned the *identical* 1,988 characters, so retrying doesn't help with this kind of error at temperature 0.3.
   The parser now takes the first complete JSON object and repairs that one specific shape, and only when strict parsing fails. Validation is unchanged.
3. Mocked tests passed first time. The real problems only appeared against the live model, which is why the live run is part of the phase.

**Results.**
- pytest: 91 passed (validation, fallback across 4 mediums × 1–10 regions, parity fixture, retry/fallback/transport-error flow, fenced, trailing and prematurely closed JSON, endpoints, and the exact Ollama request body including the prompted-JSON path).
- Live run with `gemma4:e4b` on three **stand-in** scenes (macOS wallpapers "Big Sur Mountains" for park, "Big Sur Coastline" for beach and "Big Sur Road" for street, since the fixture photos aren't in yet), acrylic and watercolor, 3 runs each, so 18 plans:
  - first full run: 17/18 valid, p50 6.2 s, p95 12.9 s (one stray-brace failure, then fixed);
  - second run: 17/18, p50 6.0 s, p95 13.2 s (one premature-close failure, then fixed);
  - final run, after both repairs: **18/18 valid on the first try, 0 fallbacks, median 6.2 s, p95 7.5 s.**
  - **Thinking on, for comparison** (6 plans): all valid, median **17.9 s**, p95 19.7 s. With thinking off the plans are just as valid and about 3× faster, so `think: false` stays.
- `/api/ask` live: 1.4–1.6 s and about 30 words. "How much white should I add?" got no amount. With a photo attached, it gave one concrete suggestion.
- These figures are on stand-in photos with small samples. The numbers the post may quote come from `scripts/eval.py` on the real fixtures (Phase 6).
