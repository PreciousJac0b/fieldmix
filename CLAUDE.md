# Fieldmix — Build Spec for Claude Code

Read this whole file at the start of every session and follow it. Work one phase at a time and stop where it says stop.

## Project summary and ground rules

Fieldmix is a painting companion for the DEV Hacktoberfest Open-Source AI Challenge, Week 1: Touch Grass. It has two modes. **Scene mode** is the headline: a plein air painter photographs the view in front of them. **Artwork mode** covers sip-and-paint events: the painter photographs the reference painting the host is teaching. In both modes the painter shows Fieldmix the paints they actually have. Fieldmix splits the image into a few color regions, works out how to mix each one from only those paints, and talks them through the painting with a local open-weight model, so the phone stays down and their eyes stay on the canvas.

**Core principle: the model never does color math.** Region extraction and mix recipes come from deterministic code (k-means in CIELAB, a pigment mixing model, Delta E 2000). Gemma only labels regions, plans the painting order, and writes and answers in plain language. Gemma receives the computed recipes as context but **never states a ratio itself**, in plans or in answers. The UI and the spoken text insert the computed recipe through a template, and any Gemma output containing a ratio pattern (for example "2 parts", "1:1", "equal amounts") fails validation.

**Recipes are starting points, not guarantees.** Real pigments, brands, opacity, and camera lighting all shift the result. Every recipe in the app comes with a quick test-dab step and adjustment tips, and the UI says so in plain words.

**Rules for Claude Code**

- **API keys: stop and ask.** Never invent, guess, hardcode, or commit a key, token, or account ID. When a task needs one, stop, tell me which service, which exact key or setting, where in that service's dashboard to create it, and the env var name you will read it from. Then wait for me to confirm I have added it to `.env`. Do not continue with a mock that pretends to be the real service.
- Keep secrets only in `.env`. Create `.env.example` with every variable name and an empty value, and make sure `.env` is in `.gitignore` before the first commit.
- **The core loop must work fully offline.** Every cloud or paid service (ElevenLabs, hosting) is optional, sits behind a feature flag, and falls back to the local path when its key is missing.
- Work one phase at a time. At the end of each phase, run its tests, show me the output, and stop for my go-ahead.
- Ask before adding any dependency not listed in the Tech stack section, and state its license.
- Do not download model weights without telling me the model name and approximate size first.
- Prefer small, readable modules with type hints and docstrings. Every color function gets a unit test with known values.
- Keep a running `DEVLOG.md`: one dated entry per phase covering what was built, what broke, and how it was fixed. I will use it for the write-up.
- If something in this spec turns out to be wrong (a library API changed, a model tag does not exist), tell me what you found and propose a fix instead of silently working around it.
- **Honest claims only.** The README and the post must state exactly what works offline in each setup: phone alone, phone plus laptop, and hosted demo. Never claim Gemma is more accurate, faster, or cheaper than an alternative unless the eval scripts (`scripts/eval.ts` and `scripts/eval.py`) measured it.

## Context and decisions (2026-10-10)

- **Deadline:** Week 1 submissions close **Sunday Oct 11, 11:59 PM PDT = Monday Oct 12, 07:59 WAT**. See "Week 1 deadline plan" below.
- **Test phone:** Android with Chrome. Design and test for Chrome on Android first.
- **Laptop:** macOS on Apple Silicon, 24 GB RAM. Node 24, Python 3.12 for the backend venv (3.14 is the system default; do not use it for the venv).
- **GitHub:** repo name `fieldmix` under the user's account. Claude Code creates it with `gh`; ask before making it public.
- **Artwork photos:** the user will supply them. Scene fixtures must be the user's own photos or CC0, since they are committed.

## Week 1 deadline plan

Writing quality is weighted most heavily in judging, so the post needs real time. Order of work:

1. Phase 0 (setup).
2. Phase 1 core: `lab`, `kmeans`, `regions`, `mix`, `recipes`, `adjust`. `dev.html` is a nice-to-have.
3. Phase 2 with Ollama only. Gemini is deferred to Phase 5.
4. Phase 3 with the quick-palette path first; swatch-card scanning only if time allows.
5. README, `DEVLOG.md`, the color half of eval, and help drafting the post. Reserve about 3 hours before the deadline for this.
6. Phase 5 (Render + Gemini) only if steps 1 to 5 are done with time to spare.

Skipped for Week 1: Phase 4 Piper and ElevenLabs (browser `speechSynthesis` is already the default), session ZIP export, and all stretch goals. Per-phase stops still apply but keep them short.

## Tech stack and tools

Gemma 4 E4B running locally through Ollama is the core; everything else is either deterministic code or an optional add-on. Use exactly these unless I approve a change.

| Layer | Choice | Role | License |
| --- | --- | --- | --- |
| Local model | [Gemma 4](<https://en.wikipedia.org/wiki/Gemma_(language_model)>) via [Ollama](https://ai.google.dev/gemma/docs/integrations/ollama), tag `gemma4:e4b` (doc says about 9.6 GB; confirm with `ollama list`) | Scene labeling, painting plan, Q&A. Fallback tag `gemma4:e2b` (doc says about 7.2 GB) for laptops under 16 GB RAM; verify it actually runs before recommending it | Apache 2.0 |
| Hosted model (demo mode only) | Gemma 4 through the [Gemini API](https://www.philschmid.de/gemma-4-gemini-api), model `gemma-4-26b-a4b-it` (verify the model ID, image input, and structured output support before coding) | Same prompts as local, for the public demo link | Apache 2.0 weights; API terms apply |
| Frontend | Vite + TypeScript, installable PWA, no UI framework | Camera capture, region map, step-by-step painting mode | MIT |
| Color engine (runs in the browser) | [spectral.js](https://www.npmjs.com/package/spectral.js) for Kubelka-Munk paint mixing; `culori` for CIELAB and CIEDE2000; hand-written k-means | Regions and mix recipes, fully offline on the phone | MIT |
| Backend | Python 3.12, FastAPI, uvicorn, httpx, `google-genai` | Model provider switch, TTS endpoint, serves the built PWA | MIT / BSD / Apache 2.0 |
| Local voice | [Piper](https://aivideosensei.com/guides/piper-tts-offline-voice-guide) (`piper-tts`), one English voice such as `en_US-amy-medium` | Spoken steps with no internet. Fallback: browser `speechSynthesis` | GPL-3.0 (run as an optional, separately installed process) |
| Cloud voice (optional) | ElevenLabs text-to-speech API | Nicer narration when online, and for the demo video | Proprietary, behind a flag |
| Tests | Vitest (frontend), pytest (backend) | Color math and API tests | MIT |
| Hosting | Render: **one web service** running FastAPI, which also serves the built PWA from `web/dist` | Public demo link | Service terms |

No extra libraries for small jobs: `.env` is read by a few lines in `server/app/config.py` (no python-dotenv), rate limiting is hand-written (no slowapi), and TypeScript scripts run on Node 24's built-in type stripping (no tsx).

**Why the color engine lives in the browser:** the phone can produce regions and recipes with no laptop and no signal. Gemma narration needs either a laptop running Ollama on the same Wi-Fi or phone hotspot, or the hosted demo backend.

**Licensing note for Claude Code:** keep the repo MIT. Piper is GPL-3.0, so do not vendor or import its code into the repo. Install it as an optional extra and call the `piper` executable as a subprocess. Piper voice files have their own licenses: read the voice's model card before downloading, and keep `voices/` gitignored.

## Architecture and repo layout

The phone does the color math; the backend only talks to Gemma and the voice engine. One painting session flows like this:

1. **Scene photo** is downscaled in the browser twice: a 512 px (long edge) copy for k-means, and a 768 px JPEG (quality about 0.8) that is sent to the model. The server never upscales.
2. **Regions:** k-means in CIELAB (k = 6 by default, slider 4 to 10), then merge clusters closer than Delta E 2000 of 6 and drop specks under 1% of the area. Empty or duplicate clusters must be handled. Output per region: id, hex, Lab, area %, centroid, bounding box, plus a label map image.
3. **Palette:** either the user ticks paints from a preset list (quick path), or photographs paint dabs on white paper, taps each dab, and names it (accurate path). Sample a 15 x 15 px median at each tap. White-balance using a tap on bare paper: scale each channel **in linear light** so the paper ends up at sRGB (245, 245, 245), which is 0.913 in linear terms. The scene photo is not white-balanced by default, so scene and swatches can sit on different white points; this is a known limit to state in the UI and README. An optional paper tap on the scene photo may correct it.
4. **Recipes:** for each region, search mixes of 1 to 3 colored paints, plus white and black as **extra slots** if the user has them (at most 4 components in total), in whole-number parts from 1 to 6. Skip equivalent ratios (2:2 is the same as 1:1, so reduce by the GCD). Precompute each paint's spectral data once. Mix with spectral.js, score with CIEDE2000, keep the best 2 options. Flag any region whose best Delta E is above 10 as "closest possible". If the search is too slow, search coarse-to-fine and/or prune to the paints whose hues bracket the target (never prune to "nearest paints only", because blue and yellow are both far from green).
5. **Plan:** the browser sends the 768 px image, regions, recipes, and medium to `POST /api/plan`. Gemma returns region labels and an ordered list of painting steps as JSON.
6. **Paint mode:** one step per screen in large type. The recipe text always comes from step 4, never from Gemma. The spoken text is a template: Gemma's instruction followed by the computed recipe. Each step is read aloud through `POST /api/tts` (or browser `speechSynthesis`), and the user can ask a question through `POST /api/ask`.

Three interactions sit on top of this flow, all computed in the browser, never by Gemma:

- **"I don't have that color" eyedropper:** long-press any point on the image to get the top 2 recipes for that exact color (5 x 5 px median), even if it was merged into a bigger region.
- **Adjustment tips:** compare the best mix with its target in Lab. Lightness off by more than 5 means add white (or the lightest palette paint if there is no white) to lighten, or the darkest paint to darken. Chroma too high (Delta C\* above 8) means a touch of the paint closest to the complement. Hue off by more than 15 degrees means naming the palette paint that pulls it back.
- **Test dab and adjust:** in paint mode the painter mixes a pea-sized amount, dabs it on the canvas edge, and taps Too light, Too dark, Too dull, Too bright, or Looks right. Fieldmix re-solves from that feedback by adding one extra part of **any** palette paint (not only the paints already in the recipe), chosen to move the result the way the painter reported. If no single extra part moves it the right way, say so plainly: "No single-part fix; this is the closest your paints get."

### Quality labels

Good: Delta E below 5. OK: 5 to 10 inclusive. Closest possible: above 10.

### Preset paints

- **Student set (6 + white):** Cadmium Yellow Light Hue, Cadmium Red Hue, Alizarin Crimson Hue, Ultramarine Blue, Phthalo Blue, Burnt Sienna, plus Titanium White.
- **Extra common colors (about 10):** Yellow Ochre, Lemon Yellow, Raw Sienna, Burnt Umber, Raw Umber, Quinacridone Magenta, Dioxazine Purple, Phthalo Green, Sap Green, Cerulean Blue Hue, Payne's Grey, Mars Black.
- **Eval palettes:** (1) the student set; (2) primaries plus white and black: Cadmium Yellow Light Hue, Cadmium Red Hue, Ultramarine Blue, Titanium White, Mars Black; (3) a 4-paint minimal set: Cadmium Yellow Light Hue, Alizarin Crimson Hue, Ultramarine Blue, Titanium White.
- Preset hex values are approximations of typical student-grade paint. The UI says so, and points to swatch scanning for accuracy.

### API contract

```
GET  /api/health  -> { provider, model, tts, model_ready: bool }

POST /api/plan
  body: { image_b64, mode: "scene"|"artwork", medium: "acrylic"|"watercolor"|"oil"|"gouache", minutes: int,
          palette: [{ id, name, hex }],
          regions: [{ id, hex, lab: [L,a,b], area_pct, centroid: [x,y], bbox: [x,y,w,h] }],
          recipes: [{ region_id, parts: [{ paint_id, parts }], result_hex, delta_e }] }
  200:  { labels: [{ region_id, label }],
          steps:  [{ order, region_ids: [id], title, instruction, technique_tip, est_minutes }],
          source: "gemma" | "fallback" }

POST /api/ask  body: { question, plan, current_step: int (the step's `order`), image_b64? }  ->  { answer }
POST /api/tts  body: { text }  ->  audio/wav or audio/mpeg   (503 when no server voice is available; the client then uses speechSynthesis)
```

The JSON schema sent to the model (Ollama `format`) is generated from a model-output-only pydantic model containing `labels` and `steps`. `source` is set by the server and is never part of the model's schema.

### Environment variables (`.env.example`)

```
LLM_PROVIDER=ollama            # ollama | gemini
OLLAMA_HOST=http://localhost:11434
OLLAMA_MODEL=gemma4:e4b
GEMINI_API_KEY=                # demo mode only; ask the user
GEMINI_MODEL=gemma-4-26b-a4b-it
TTS_PROVIDER=browser           # browser | piper | elevenlabs
PIPER_VOICE_PATH=./voices/en_US-amy-medium.onnx
ELEVENLABS_API_KEY=            # optional; ask the user
ELEVENLABS_VOICE_ID=           # optional; ask the user
ALLOWED_ORIGINS=http://localhost:5173
```

### Networking and secure context (Android Chrome)

- **Dev:** `scripts/dev.sh` runs Vite with `--host` and Vite's built-in `server.proxy` forwards `/api` to `localhost:8000`. The phone opens `http://<laptop-LAN-IP>:5173` and every API call is same-origin, so no CORS changes are needed.
- **Field mode:** FastAPI serves the built `web/dist` on port 8000, so the phone loads the PWA and the API from one origin.
- **Secure context:** a plain-HTTP LAN address is not a secure context, so Screen Wake Lock, service workers, and PWA install are unavailable there. Handle it in two ways: (1) document the Chrome flag `chrome://flags/#unsafely-treat-insecure-origin-as-secure` with the laptop URL, which turns them on for that origin on the user's own phone; (2) if `navigator.wakeLock` is missing, fall back to a muted, looping, inline video to keep the screen on.
- **Mixed content:** the HTTPS Render demo cannot call an `http://` laptop backend. The backend URL setting is for the locally served PWA only.
- **Phone alone, no laptop:** requires the PWA to have been installed once from the HTTPS demo (Phase 5), or the page to be already loaded in a tab. State this in the README.
- **Audio:** Chrome blocks audio and `speechSynthesis` until a user gesture. A "Start painting" tap unlocks audio; each Next tap counts as a gesture after that.

### Repo layout

```
fieldmix/
  CLAUDE.md  DEVLOG.md  README.md  LICENSE  .env.example  .gitignore  render.yaml
  fixtures/
    scenes/      park.jpg  beach.jpg  street.jpg  (user's own photos or CC0)
    artwork/     (user supplies)
    planner_parity.json   (shared inputs/expected outputs for both fallback planners)
  web/
    index.html  dev.html
    src/color/   lab.ts  kmeans.ts  regions.ts  swatches.ts  mix.ts  recipes.ts  recipes.worker.ts  adjust.ts  paints.ts
    src/plan/    fallback.ts
    src/ui/      setup.ts  capture.ts  palette.ts  regionMap.ts  paintMode.ts  settings.ts  wakeLock.ts
    src/api.ts   src/main.ts
    tests/       (Vitest)
  server/
    requirements.txt
    app/main.py  app/config.py  app/schemas.py  app/fallback.py  app/validate.py  app/ratelimit.py  app/logging.py
    app/providers/  base.py  ollama.py  gemini.py
    app/tts/        base.py  piper.py  elevenlabs.py
    app/prompts/    plan.md  ask.md
    tests/       (pytest)
  scripts/   dev.sh  pull_model.sh  smoke_test.py  fieldtest.sh  eval.ts  eval.py
  eval/      results.md
```

## Phase-by-phase tasks

Seven phases, each ending in a demo you can run. Phases 0 to 3 are the minimum shippable entry; 4 to 6 add voice, a public link, and the field kit. For Week 1, follow the deadline plan above.

### Phase 0: Setup

- [ ] `git init`, MIT `LICENSE`, `.gitignore` covering `.env`, `voices/`, `node_modules/`, `__pycache__/`, `server/logs/`, `.venv/`, `web/dist/`.
- [ ] Scaffold `web/` with Vite (vanilla TypeScript) and `server/` with FastAPI in a Python 3.12 virtual environment with pinned `requirements.txt`.
- [ ] Create `.env.example` exactly as in the Architecture section.
- [ ] Check `ollama --version`. If missing, give me install steps for my OS and stop. Before pulling, tell me the tag and size, then run `ollama pull gemma4:e4b`. Confirm the tag exists with `ollama list` rather than trusting this doc, and report the real size.
- [ ] `GET /api/health` and `scripts/dev.sh`, which starts the backend on port 8000 and Vite (`--host`, with the `/api` proxy) on port 5173.
- [ ] Smoke test (`scripts/smoke_test.py`): send one landscape JPEG to Gemma through Ollama's `/api/chat` with the `images` field and print the caption.
- [ ] Create the GitHub repo `fieldmix` with `gh` (private until I say otherwise) and push the first commit.

**Done when:** `scripts/dev.sh` starts both apps, `/api/health` returns `model_ready: true`, and the smoke test prints a sensible caption.

### Phase 1: Color engine (no AI)

- [ ] `lab.ts`: sRGB to CIELAB (D65) and CIEDE2000 using `culori`. Test against at least 5 pairs from the Sharma et al. 2005 CIEDE2000 test data, tolerance 0.0001.
- [ ] `kmeans.ts`: k-means++ in Lab, seeded RNG so tests are deterministic, max 20 iterations. Subsample pixels if needed for speed.
- [ ] `regions.ts`: merge clusters within Delta E 6, absorb regions under 1% area into their nearest neighbor, output region list plus a label map and a numbered outline overlay.
- [ ] `swatches.ts`: 15 x 15 px median sample at a tap, white balance from a paper tap (scale in linear light so the paper ends up at sRGB 245, 245, 245).
- [ ] `mix.ts`: thin wrapper around spectral.js that mixes N paints with integer weights. Read the installed version's README for the real API; do not guess it.
- [ ] `paints.ts`: the preset paints and eval palettes from the Architecture section.
- [ ] `recipes.ts` + `recipes.worker.ts`: search as described in Architecture step 4 (1 to 3 colored paints, white and black as extra slots, at most 4 components, parts 1 to 6, GCD-deduplicated, ranked by CIEDE2000). Run it in a Web Worker. Target: 10 regions x 12 paints under 3 s on a throttled Chrome (4x CPU slowdown). If over, go coarse-to-fine and/or prune by hue bracketing.
- [ ] `web/dev.html`: debug page showing the region map and, for each region, target chip, mixed chip, recipe, and Delta E.
- [ ] `adjust.ts`: eyedropper recipe lookup for one point, rule-based adjustment tips, and the test-dab re-solve (current recipe plus one extra part of any palette paint, chosen to move the result the way the painter reported, or the "no single-part fix" result). One unit test per feedback button: when a fix exists, Too light must lower L, Too dark must raise L, Too dull must raise chroma, Too bright must lower chroma; and a test that the "no single-part fix" result appears when the palette cannot move the mix that way.

**Done when:** all unit tests pass; a synthetic 4-color test image (colors more than Delta E 20 apart, run at the default k = 6) yields 4 regions each within Delta E 2 of its source; a blue plus yellow mix lands at a hue angle between 90 and 180 degrees (green); and with the student palette (6 + white), at least 80% of regions in three fixture landscape photos get a recipe under Delta E 10.

### Phase 2: Gemma planner backend

- [ ] `providers/base.py`: a `Provider` interface with `plan(req) -> PlanResponse` and `ask(req) -> str`. Pydantic models in `schemas.py` match the API contract exactly, plus a separate model-output model (`labels`, `steps`) used for the schema.
- [ ] `providers/ollama.py`: call `/api/chat` with the image (already 768 px from the browser), `format` set to the JSON schema of the model-output model, temperature 0.3, timeout 120 s.
- [ ] `prompts/plan.md`, the system prompt. It must say: you are a patient plein air painting teacher; use only the region ids given; never state mixing ratios or amounts, and never name a paint that is not in the palette; acrylic, oil, and gouache go background to foreground and big shapes before detail; watercolor goes light to dark and reserves the whites; in artwork mode, follow the reference painting's likely layer order and simplify it for beginners; 5 to 10 steps; each instruction under 60 words; step times should add up to roughly the user's available minutes.
- [ ] Validation (`validate.py`): every `region_id` exists; every region appears in at least one step; no ratio patterns in any text field; no known paint name (from the preset list) that is not in the user's palette. On failure, retry once with the validation error appended. On a second failure, use the deterministic fallback planner (`fallback.py`: sort by vertical position, then by lightness according to medium) and set `source: "fallback"`.
- [ ] Fallback parity: `fixtures/planner_parity.json` holds inputs and expected outputs; both `server/app/fallback.py` and `web/src/plan/fallback.ts` are tested against it.
- [ ] `POST /api/ask`: answer in under 80 words using the plan and current step. If an image is attached, treat it as a photo of the painting in progress and give one concrete suggestion. Apply the same ratio check; on failure, retry once, then return a short answer that points to the on-screen recipe.
- [ ] Log each model call as a JSON line in `server/logs/` with provider, model, latency in ms, and whether the fallback was used.
- [ ] `providers/gemini.py`: build this last (deferred to Phase 5 for Week 1). **Stop and ask me for `GEMINI_API_KEY` before writing or running it.** Use `google-genai` with `GEMINI_MODEL`. First check whether this model supports a system instruction, image input, and `response_schema`; if not, put the prompt and schema in the user message and rely on validation, retry, and fallback.

**Done when:** pytest passes with a mocked provider; a live run on 3 fixture scenes (a park, a beach, a street with trees) returns valid plans on all 3 with Ollama; and median latency is recorded in `DEVLOG.md`.

### Phase 3: Phone-first PWA

- [ ] **Setup screen:** medium, minutes available (30, 60, or 90), and number of regions (slider 4 to 10, default 6).
- [ ] **Scene capture:** `<input type="file" accept="image/*" capture="environment">`, which works without HTTPS. Do not use `getUserMedia`.
- [ ] **Palette capture:** photograph the swatch card, tap each dab, name it from a list of common paint names with a free-text option. Save named palettes in IndexedDB so a painter sets them up once.
- [ ] **Region map:** numbered overlay plus one card per region showing the target chip, the mixed-result chip, parts as dots (for example, two dots Ultramarine and one dot Burnt Sienna), and a quality label (see Quality labels).
- [ ] **Paint mode:** one step per screen, text at 22 px or larger, Next and Back buttons at least 64 px tall for paint-covered fingers, Screen Wake Lock on (with the video fallback), high-contrast theme readable in sunlight. A "Start painting" tap unlocks audio, then each step auto-plays its audio.
- [ ] **Settings:** a backend URL field so the phone can point at the laptop's LAN address (locally served PWA only; see Networking).
- [ ] **Field serving:** FastAPI serves the built `web/dist` so the phone can load everything from one origin on port 8000.
- [ ] **Offline fallback:** if the backend is unreachable, run the TypeScript fallback planner and use browser `speechSynthesis`. Show a small "offline mode" badge.
- [ ] **Mode choice** on the Setup screen: Scene (painting outdoors) or Artwork (a reference painting at an event). Send `mode` to `/api/plan`.
- [ ] **Quick palette:** tick paints from the preset list (student set plus extra common colors) as the fast path; swatch-card scanning stays as the accurate path. The demo must work with the quick path alone.
- [ ] **Eyedropper and test dab:** long-press anywhere on the region map for an eyedropper recipe. In paint mode, every step with a mix opens with a test-dab card and the five feedback buttons. Label every recipe "starting point" in the UI.

**Done when:** the full flow works on a real Android phone (Chrome) pointed at the laptop over Wi-Fi, and with FastAPI stopped (the page already loaded, or Vite still serving it) the phone still produces regions, recipes, steps, and spoken audio.

### Phase 4: Voice

- [ ] `TTS_PROVIDER=browser` stays the default and needs nothing.
- [ ] Piper: check for the `piper` executable. Tell me the voice file name, size, and license before downloading it into `voices/`. Synthesize to WAV and cache by a hash of the text.
- [ ] ElevenLabs: **stop and ask me for `ELEVENLABS_API_KEY` and `ELEVENLABS_VOICE_ID`.** Check the current text-to-speech endpoint and model ID in ElevenLabs' docs before coding. If the key is missing or a call fails, fall back to Piper, then the browser voice, and report the active engine in `/api/health`.

**Done when:** every step in paint mode is spoken within 1.5 s on the laptop using Piper, and switching `TTS_PROVIDER` needs only an env change and a restart.

### Phase 5: Public demo on Render

- [ ] The demo is a single Render web service over HTTPS (FastAPI already serves `web/dist` from Phase 3). Write `render.yaml` with `LLM_PROVIDER=gemini`, `TTS_PROVIDER=browser`, and the Python version pinned to 3.12.
- [ ] Add hand-written rate limiting on `/api/plan` and `/api/ask` (10 requests per IP per hour, in memory; take the client IP from the first `X-Forwarded-For` entry behind Render's proxy) and a 2 MB request size cap to protect the key's quota.
- [ ] Add a service worker and manifest so the HTTPS demo is installable and the color engine works offline after the first visit.
- [ ] Build `providers/gemini.py` here if it was deferred (stop and ask for the key first).
- [ ] **Stop and ask me** to create the Render account, connect the GitHub repo, and paste `GEMINI_API_KEY` (and the ElevenLabs keys, if used) into Render's environment settings. Never put keys in `render.yaml`.
- [ ] Note in the README that Render's free tier sleeps when idle, so the first request can take 30 to 60 s.

**Done when:** the public URL completes the full flow on a phone over mobile data, and the installed PWA still produces recipes in airplane mode.

### Phase 6: Field kit

- [ ] `scripts/fieldtest.sh`: start the backend bound to `0.0.0.0`, preload Gemma (`keep_alive` of 2 hours so the first step is not slow), and print the phone URL as text plus a terminal QR code.
- [ ] Session export: a button that saves the scene photo, palette, recipes, plan, timings, and an optional photo of the finished painting as a ZIP. I will use it for the post.
- [ ] `README.md`: what it is, a 5-minute local setup, field setup with a phone hotspot, the Chrome secure-origin flag, what works offline in each setup, and a "Why open" section drafted from `DEVLOG.md`.
- [ ] Eval, split by language: `scripts/eval.ts` (run with Node 24) runs every fixture photo against the 3 eval palettes and writes the color section of `eval/results.md` (share of regions under Delta E 10, median Delta E). `scripts/eval.py` runs the plan prompts and writes the model section (share of valid Gemma plans, p50 and p95 latency for local and hosted Gemma). These are the only performance numbers the post may quote.
- [ ] Offline proof: log every outgoing network request in the PWA and backend during the field test, and show none leave the hotspot network.

**Done when:** with the laptop and the Android phone on the phone's hotspot and mobile data turned off, a full session runs from capture to the last step.

## API keys and accounts checklist

Only two keys are ever needed, and neither is needed for the offline core. Claude Code must stop and ask at the phase listed, never earlier, never by guessing.

| Service | Phase that asks | Env var(s) | Where you get it | Needed for |
| --- | --- | --- | --- | --- |
| Ollama + Gemma 4 | 0 | none | Local install, `ollama pull gemma4:e4b` | Core app (required) |
| Google AI Studio (Gemini API) | 5 (deferred from end of 2 for Week 1) | `GEMINI_API_KEY` | Create one at aistudio.google.com/apikey ([setup guide](https://www.philschmid.de/gemma-4-gemini-api)) | Hosted demo only |
| ElevenLabs | 4 | `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID` | ElevenLabs dashboard: API keys page, plus a voice ID from the voice library | Optional nicer voice |
| Render | 5 | none in the repo; keys go in Render's environment settings | render.com account connected to your GitHub repo | Public demo link |
| GitHub | 0 | none | Your own `gh` login on your machine | Hosting the code |
| Piper voices | 4 | none | Public download, no token | Offline voice |

If any download or service unexpectedly asks for a token, that is also a stop-and-ask moment.

**Exact message format Claude Code should use when it needs a key:**

```
I need a key to continue.
Service: <name>
What to create: <exact key type / setting>
Where: <dashboard page or URL>
Add it to .env as: <VAR_NAME>=...
Why now: <which task is blocked>
Cost/limits to know about: <free tier, quota, or "unknown, please check">
Reply "added" when done, or "skip" to keep the local fallback.
```

## Stretch goals, field test, and write-up

Only start a stretch goal once Phase 6 is done. Each is self-contained, so Claude Code can pick one up from a single prompt.

**Stretch goals, in order of payoff**

- [ ] **Progress check:** photograph the canvas mid-session and Gemma compares it to the scene and the current step, giving one suggestion. This reuses `/api/ask` with an image.
- [ ] **Voice questions:** push-to-talk with local `faster-whisper` on the laptop. Ask me before adding it and tell me the model size.
- [ ] **Mix calibration with TabPFN:** the user paints 15 to 20 test mixes, photographs them, and a small CSV of predicted versus measured Lab values trains a correction for their specific paint brand. This could also enter the TabPFN category. Stop and ask me for any Prior Labs key it needs.
- [ ] **Closed-model baseline:** run the same plan prompts through one closed vision API and add it to `eval/results.md`, so the "why open" section compares against something measured. Stop and ask me which provider and for its key first; skip it if I say no.

## Spec changelog

- **2026-10-10:** Integrated review fixes: Gemma never states ratios (template-inserted recipes plus a ratio check); single Render web service; eval split into `eval.ts` + `eval.py`; fallback planner parity fixture; 512 px / 768 px image split; Android Chrome secure-context handling (flag + video wake-lock fallback, no mkcert); audio unlock gesture; Vite `/api` proxy and FastAPI serving `web/dist` from Phase 3; recipe search limits, GCD dedupe, and hue-bracket pruning; test-dab may use any palette paint and has a "no single-part fix" outcome; chroma threshold and lighten-without-white rule; linear-light white balance; model-output-only schema and `current_step` as int; Gemini capability check; unverified model sizes flagged; preset and eval palettes defined; repo layout completed; synthetic-image test at k = 6; Phase 3 "backend stopped" defined; hand-written rate limiter with `X-Forwarded-For`; Piper voice license check; file renamed to `CLAUDE.md`. Added context (Android, Python 3.12, GitHub repo name) and the Week 1 deadline plan.

**Sources**

- [Gemma (language model), Wikipedia](<https://en.wikipedia.org/wiki/Gemma_(language_model)>)
- [Gemma with Ollama, Google AI for Developers](https://ai.google.dev/gemma/docs/integrations/ollama)
- [Gemma 4 Ollama tags and sizes, iTechGuides](https://www.itechguides.com/?p=331053)
- [How to use Gemma 4 with the Gemini API, Phil Schmid](https://www.philschmid.de/gemma-4-gemini-api)
- [spectral.js on npm](https://www.npmjs.com/package/spectral.js)
- [Piper TTS install and license note, AI Video Sensei](https://aivideosensei.com/guides/piper-tts-offline-voice-guide)
