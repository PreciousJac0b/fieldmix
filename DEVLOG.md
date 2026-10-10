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
