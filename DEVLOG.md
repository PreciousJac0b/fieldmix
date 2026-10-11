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

## 2026-10-11 — Phase 3: Phone-first PWA

**Built** (`web/src/`, no UI framework; a 30-line `h()` helper builds the DOM):
- **Screens:** Setup (mode, medium, 30/60/90 minutes, regions 4–10) → Photo → Paints → Color map → Plan → Paint mode, plus Settings.
- **Photo** (`ui/capture.ts`): `<input type="file" accept="image/*" capture="environment">`, never `getUserMedia`. Each photo is decoded once at 768 px (the JPEG for Gemma), and a 512 px copy is drawn from it for the color engine. In Artwork mode the hint says to photograph the host's **finished sample painting**, not the outlined canvas. (The user's outline-canvas photos made this obvious: black line art on white has nothing to mix.)
- **Paints** (`ui/palette.ts`, `store.ts`):
  - quick path: tick presets (the student set + white is preselected, and the last palette is remembered);
  - accurate path: photograph a swatch card, tap bare paper (white balance), tap each dab and name it from a list or free text;
  - named palettes are saved in IndexedDB.
- **Color map** (`ui/regionMap.ts`):
  - numbered overlay, with recipes solved in the Web Worker;
  - one card per region: target → mix chips, parts as dots, the recipe text, a Good/OK/Closest-possible badge, "Starting point: test dab first", adjustment tips when ΔE ≥ 5, and the second option under "Don't have one of these?";
  - long-press (500 ms; moving more than 10 px cancels) → eyedropper sheet with 2 recipes for that exact spot.
- **Paint mode** (`ui/paintMode.ts`):
  - a "Start painting" tap unlocks speech and keeps the screen on;
  - one step per screen at 22–30 px with fixed 72 px Back/Next buttons;
  - each step is read aloud as the model's instruction **followed by the computed recipe** (`session.spokenStep`);
  - every mix has a test-dab card with the five buttons, and feedback updates the working recipe;
  - Ask box with an optional photo of the painting in progress;
  - "Offline mode" badge.
- **Offline** (`plan/fallback.ts`): if `/api/health` doesn't answer within 3 s, or `/api/plan` fails, the TypeScript port of the fallback planner runs on the phone. All 7 parity cases match the Python planner exactly.
- **Screen on** (`ui/wakeLock.ts`): Screen Wake Lock if available, else a muted inline video fed from a 2×2 canvas (no media file). Settings explains Chrome's insecure-origin flag.
- **Field serving:** FastAPI mounts `web/dist` at `/` after the API routes.

**What broke and how it was fixed.**
- Two `append(null)` type errors, and `node:fs` with no Node types in a test. Fixed by importing the parity fixture as JSON instead of adding `@types/node`.
- **Phone layout:** the recipe dot rows wrapped, so paint names ended up on a separate line from their dots. First fix used an `em`-sized column, which grew with paint mode's 22 px text. Final fix: a natural-width grid (chip | dots | name), with the target → mix chips on their own line.
- **FastAPI served 404 at `/`:** `scripts/dev.sh`'s auto-reload happened before `web/dist` existed, and the mount was skipped. Changed to always mount. The test then caught that Starlette raises on a missing folder, so `mount_web` creates the empty gitignored folder; a build appearing later is served without a restart.

**Verified in the browser** (Chrome, phone viewport 375 × 812, stand-in photos loaded via `?photo=`):
- color map in 372 ms;
- Gemma plan in 6.8 s (Vite dev) and 9.4 s (built app from FastAPI on port 8000);
- paint mode renders;
- Too dark → +1 Titanium White, and Too dull → +1 Phthalo Blue, each re-spoken;
- Next works;
- long-press opens the eyedropper, and a short tap doesn't;
- no console errors;
- **offline:** pointing the app at a dead backend gave a fallback plan in 246 ms with the badge, and speech was playing.

Tests: web 87/87, server 92/92.

**Not verified here:** a real Android phone (the user's check: http://<laptop-IP>:5173 or :8000), the swatch-scan taps in a browser (the functions are unit-tested), and whether the video wake-lock fallback keeps an Android screen on.

**Open observations:**
1. Recipes are accurate (ΔE 0.4–0.9) but often use 4 paints and up to 16 parts. Painters would probably prefer a 2-paint mix at ΔE 3.
2. The fallback's color-only labels can be wrong (a blue-grey rock labeled "sky"). Gemma labels from the image when the laptop is reachable.

### 2026-10-11 — Pause/Resume for spoken steps (user request)

- **What it does:** a **⏸ Pause / ▶ Resume** button sits in paint mode's fixed bar between Back and Next, where it's easy to hit with a paint-covered finger. When nothing is playing it shows **🔊 Play**, which replays the step. The label and `aria-pressed` follow the speech state.
- **Why not `speechSynthesis.pause()`:** it is unreliable on Android Chrome, where it often stops for good. Instead `speech.ts` speaks the step as a queue of sentences. Pause cancels and remembers the sentence that was playing; Resume restarts from the beginning of that sentence. A generation counter ignores the error events Chrome fires for its own cancellations.
- **The same speaker handles everything spoken:** steps, test-dab messages and Ask answers can all be paused.
- **Tests:** 9 unit tests with a fake speech engine (sentence splitting; pause/resume mid-sentence; nothing skipped; toggle; new text while paused; stop; pause during the last sentence). Web tests now 96/96.
- **Checked in Chrome with the real engine:** Pause → the engine goes silent and stays silent; Resume → speaking again; Next or Back while paused starts the new step fresh; after speech finishes the button shows Play, and tapping it speaks again.

### 2026-10-11 — Photo buttons on a laptop (user report)

- **Report:** on the laptop, "Take photo" and "Choose from gallery" both opened a file picker.
- **Cause:** desktop browsers ignore the file input's `capture` attribute, so this is expected. On Android Chrome, "Take photo" opens the rear camera directly. The spec rules out `getUserMedia`, because it needs a secure context, which the phone doesn't have over http on Wi-Fi.
- **Fix:** the screen now adapts. On a touch-first device (`pointer: coarse`) it shows "Take photo" + "Choose from gallery". Otherwise it shows a single "Choose a photo" button, with a note that the camera opens when Fieldmix is opened on a phone. The swatch-card button's label adapts the same way.
- **Checked:** both layouts in Chrome (desktop, and Android emulation with touch).

### 2026-10-11 — Region numbers stacked in the middle on line art (user report)

- **Report:** on an outline drawing (a coloring-page portrait), the region numbers 1, 2, 4 and 6 piled up on one spot in the middle.
- **Cause:** each number was drawn on the region pixel nearest the region's mean position. On line art every region (white page, black lines, the grey anti-aliasing at line edges) is spread over the whole picture, so every mean, and every number, lands near the center. Reproduced on a crop of the user's screenshot: all 5 regions were neutral (chroma 0), with their numbers within about 60 px of the center.
- **Fix 1, label placement** (`placeLabels`, `regionDistance`): a chamfer distance transform per region finds the pixel farthest from the region's edges, with ties going toward the region's center. Regions are placed largest first, and each number must stay at least `max(24 px, 8% of the short side)` from numbers already placed. This adds 33–53 ms per image, including clustering. On landscapes, numbers now sit inside open areas (the sea, the hillside) instead of on edges.
- **Fix 2, line-art detection** (`neutralShare`): if 90% or more of the picture is neutral (chroma < 10), the color map shows a note: it looks like an outline drawing or blank canvas, so there are no colors to mix; photograph the host's finished sample painting instead. It comes with a "Take a different photo" button, and the user can still continue.
- **Tests (+5, web now 101/101):** distance-transform values; a scattered region gets its number inside one of its squares, not at the gap's centroid; numbers on synthetic line art stay at least the spacing apart; every number sits on its own region; `neutralShare` is above 0.99 for line art and below 0.01 for a colorful scene.
- **Checked in Chrome at phone size:** the line-art image shows the note and the numbers don't overlap; the coastline shows no note, and its numbers sit inside the right areas.

### 2026-10-11 — Before / after comparison (user request)

- **Built:** a "Before / after" tab next to "Color map". On the left is the uploaded photo; on the right, a preview of the finished painting made from the painter's own mixes. Every region is filled with its **current** recipe's spectral.js mix color, so test-dab adjustments show up (the tab is rebuilt each time it opens).
- **Making the preview look painted:** a 5 × 5 majority (mode) filter first turns k-means speckle into blocky shapes, like the ones a painter actually blocks in.
- **Comparing:** a wipe divider you can drag on the picture (with pointer capture, falling back to a tracked drag), plus a slider and Photo / Both / Painting buttons.
- **Shown below it:**
  - the overall color match: area-weighted CIEDE2000 between each region's target and its mix, with a Good/OK/Closest-possible badge;
  - how many of the painter's paints the plan uses;
  - a plain note that this is flat shapes in mixed colors, and that brushwork, layering, real pigments and light will change the result.
- **Code:** `color/preview.ts` holds pure functions (`hexToRgb8`, `modeFilter`, `paintPreview`, `areaWeightedDeltaE`; 7 tests). `ui/compare.ts` is the view. Web tests: 108/108.
- **Fixed on the way:** TypeScript 6 rejected `new ImageData(Uint8ClampedArray<ArrayBufferLike>)`, so `paintPreview` now declares a plain `ArrayBuffer`. The three quick buttons wrapped at phone width; they're now a 3-column row.
- **Checked in Chrome at phone size (coastline stand-in):**
  - the tab builds in 15 ms and shows "Good, average ΔE 0.6";
  - dragging moves the divider, and moving after letting go doesn't;
  - Photo and Painting jump to each end (the center pixel switches between the photo and the mix color).

### 2026-10-11 — Before / after on line art showed a "cream layer" (user report)

- **Report:** on an outline drawing, the "painting" side added no color, just a yellowish layer.
- **Diagnosis** (measured on the user's image): it is 100% neutral, with all 5 regions at chroma 0. The page (92% of the picture) correctly matches 1 part Titanium White, whose preset `#f4f3ee` (Lab 95.8, −0.5, 2.5) is a warm off-white; that's the cream tint. The lines get grey mixes. So the preview faithfully reproduced a photo with no colors in it. By design, Fieldmix never invents colors.
- **Fix:** when the photo is line art (`isLineArt`, now shared by both tabs), Before / after starts with a note explaining that there are no colors to preview, why the page looks cream, and that for a sip-and-paint outline canvas you should photograph the host's finished sample painting.
- **Possible next feature, not built:** "Color it in" for outline canvases. Tap a shape, choose one of your paints or mixes, and the preview fills it.

### 2026-10-11 — "Color it in" for outline canvases (user request)

- **Why:** a sip-and-paint outline canvas has no colors to mix, so the before/after preview stayed blank. Rather than invent colors (the color engine never does), the painter chooses them.
- **Built:**
  - `color/coloring.ts` (pure, 6 tests):
    - outline = pixels darker than L* 60;
    - the outline is thickened by a gap-closing radius so breaks in the strokes don't leak;
    - every 4-connected non-outline area is a fillable shape;
    - a tap on a line snaps to the nearest shape;
    - rendering fills the thickened margin from the neighboring fill, so there's no white halo;
    - `regionsFromColoring` turns the choices into planner regions: one per chosen color, with the outline and unpainted areas left unlabeled.
  - `ui/colorIn.ts`:
    - your paints as chips, plus "As is / Lighter / Pale" (0, 1 or 3 parts of your white, mixed with spectral.js);
    - tap to fill, Undo, Clear;
    - "Close gaps: Less / Normal / More";
    - "Your colors" with exact recipes;
    - **Paint with these colors**, which replaces the session's regions and recipes with the chosen colors (ΔE 0, since they're the painter's own choices) and runs the normal planner (Gemma, or the offline fallback).
  - Line-art photos now show a "Color it in" tab (instead of Before / after) and a "Color it in" button in the color-map note.
- **Tuning the gap closing on the user's coloring page** (a portrait with open hair strokes; measured with a probe script):
  - at 1–4 px the face, hair and background were one shape (27.9% of the picture);
  - at 5 px the face (7.8%) separates while the cap stays its own shape;
  - from 6 px thin shapes start disappearing into the outline.
  So the default is 5, with Less = 3 and More = 7. The first test image was a crop of a screenshot where the old region overlay had broken the lines into dashes, which exaggerated the leaks; a cleaner crop was used for tuning.
- **Limit, stated in the UI:** strokes that are open in the drawing itself (the hair curls here) aren't enclosed shapes, so they fill together with the background. If color spills, Undo and choose More.
- **Checked in Chrome at phone size, end to end:**
  - colored the cap (Cadmium Red Hue), the face (Burnt Sienna + 1 Titanium White) and the background;
  - "Paint with these colors" → a Gemma plan in 11.5 s, step 1 "Start with the darkest hat area", recipe "1 part Cadmium Red Hue";
  - Exit → the color map shows the 3 colored regions, and the fills are kept.
- **Fixed on the way:** the wake-lock fallback's `video.play()` promise was rejected without a handler when paint mode ended quickly. It's now caught.
- Web tests: 114/114.

### 2026-10-11 — Simpler recipes (user approved)

- **Problem:** the most accurate recipe was often 4 paints and up to 16 parts (the coastline sea was 6 Ultramarine + 5 White + 3 Phthalo + 2 Cadmium Red at ΔE 1.0). Nobody mixes that at an easel for a difference they can't see.
- **Rule:** among recipes within ΔE00 2 of the most accurate, take the fewest paints, then the fewest total parts. The tolerance is also capped at the quality-label boundaries (Good < 5, OK ≤ 10), so simplifying never downgrades the label a painter sees.
- **Search change:** the CIE76 shortlist is now kept per recipe size (1, 2, 3 and 4 paints, 48 each), so simple recipes can't be crowded out of the shortlist by complex near-perfect ones.
- **Tests:** a brute-force check over every candidate for 6 colors (nothing within the limit is strictly simpler than the chosen recipe), the label-boundary cap, and the sea case. Web tests: 116/116.
- **Measured on the 3 stand-in landscapes** (student palette, 17 regions), before → after:

  | | Before | After |
  | --- | --- | --- |
  | Average parts per recipe | 12.4 | 6.8 |
  | Average paints | 3.65 | 2.94 |
  | Mean ΔE | 2.37 | 3.52 |
  | Regions under ΔE 10 | 16/17 | 16/17 |

  The coastline sea is now 2 Phthalo + 2 White + 1 Alizarin (ΔE 1.9). An uncapped first version dropped one region from "OK" to "Closest possible", which is why the cap was added.
