# Fieldmix

**A painting coach that mixes from the paints you actually own.** Photograph the view
in front of you (or the host's sample painting at a paint-and-sip), tap the paints in
your bag, and Fieldmix splits the picture into a few color shapes, works out how to mix
each one from *only* your paints, and talks you through the painting step by step, so
the phone goes face-down next to the palette.

Built for the DEV [Hacktoberfest Open-Source AI Challenge, Week 1: Touch Grass](https://dev.to/challenges/hacktoberfest-week1-2026-10-05).

## The one rule: the model never does color math

- **Deterministic code does all the color:**
  - k-means in CIELAB finds the color shapes;
  - [spectral.js](https://www.npmjs.com/package/spectral.js) (Kubelka-Munk) mixes paints the way pigment mixes;
  - CIEDE2000 scores how close each mix gets.
- **[Gemma 4](https://ai.google.dev/gemma) (`gemma4:e4b`, running locally through [Ollama](https://ollama.com)) is the teacher:**
  - labels the shapes, plans the painting order and writes the instructions;
  - answers questions, and suggests colors for outline drawings.

Gemma sees which paints each recipe uses, but never the amounts. Any model output that
states a ratio ("2 parts", "1:1", "half and half") or names a paint you don't own fails
validation. Each failure gets one retry, then a deterministic planner takes over. The
recipe you see and hear is inserted by a template, never written by the model.

## What it does

- **Color map:** numbered shapes, each with a recipe in whole parts from your paints, a Good / OK / Closest possible badge, and a second option that uses different paints.
- **Test dab:** mix a pea-sized amount, dab it, tap Too light / Too dark / Too dull / Too bright, and get the recipe plus one part of whichever of your paints fixes it.
- **Eyedropper:** long-press any spot for the two best recipes for exactly that color.
- **Before / after:** a flat preview of the painting made from your mixes.
- **Color it in:** for pre-drawn outline canvases. Tap shapes to fill them with your paints, draw your own outlines where the drawing is open, or let Gemma suggest colors.
- **Paint mode:** one step per screen in big type, read aloud with the recipe. Pause / Resume, the screen kept on, and Ask a question (optionally with a photo of your canvas).

Every recipe is a *starting point*: real paint, brands and the light in your photo all shift the result.

## 5-minute setup (laptop)

You need macOS or Linux, Node 24, Python 3.12, and [Ollama](https://ollama.com). The
model is a one-time 9.5 GB download, and runs comfortably on an Apple Silicon Mac with
24 GB of RAM.

```bash
git clone https://github.com/PreciousJac0b/fieldmix.git && cd fieldmix
cp .env.example .env
ollama pull gemma4:e4b
python3.12 -m venv server/.venv && server/.venv/bin/pip install -r server/requirements.txt
(cd web && npm install)
scripts/dev.sh
```

`scripts/dev.sh` starts the backend on port 8000 and the app on port 5173, and prints
three addresses. Open the **Phone** one on your phone (same Wi-Fi), or
http://localhost:5173 on the laptop.

## Field setup (phone + laptop, no internet)

1. Turn on your phone's hotspot and join it from the laptop. Mobile data can stay off: the app requests nothing beyond your laptop (it loads no fonts, CDNs or cloud APIs).
2. Build the app once so the backend serves everything from one address:
   ```bash
   (cd web && npm run build)
   (cd server && .venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000)
   ```
3. On the phone, open `http://<laptop-ip>:8000`. On macOS, `ipconfig getifaddr en0` prints the IP (the hotspot interface may differ).

**Keeping the screen on.** A page loaded over plain http from a LAN address isn't a
"secure context", so Chrome blocks the Screen Wake Lock. Fieldmix falls back to a silent
looping video. For the real wake lock on your own phone, open
`chrome://flags/#unsafely-treat-insecure-origin-as-secure`, add the laptop address
(for example `http://192.168.1.20:8000`), and relaunch Chrome.

## What works offline, in each setup

| Setup | Color shapes and recipes | Painting plan | Spoken steps | Questions, Suggest colors |
| --- | --- | --- | --- | --- |
| **Phone alone** (page already loaded from the laptop) | ✅ on the phone | Built-in planner | ✅ browser voice | ❌ |
| **Phone + laptop** (Wi-Fi or hotspot, no internet) | ✅ | ✅ Gemma | ✅ | ✅ |
| **Hosted demo** | Not built yet (the plan is Render + Gemma via the Gemini API) | | | |

There's no service worker yet, so "phone alone" means a page that's already open. A
fresh visit needs the laptop.

## Measured

From `scripts/eval.ts` and `scripts/eval.py` (details in [eval/results.md](eval/results.md)).
The test scenes were **stand-ins** (macOS landscape wallpapers), not field photos.

- Recipes under ΔE 10: **94%** of regions with a 6-color student set + white (median ΔE 2.55), **100%** with 3 primaries + white + black (median 2.67), **82%** with a 4-paint set (median 4.40).
- Gemma plans: **18/18 valid** on the first try, median **6.6 s**, p95 9.5 s (local `gemma4:e4b`, thinking off).

## Why open

- **It runs where painters are.** The color engine is MIT-licensed code in the phone's browser. Gemma runs on your own laptop over Wi-Fi or a hotspot, not in a data center.
- **No keys, no bill, no account.** Nothing is metered.
- **Your photos stay on your hardware.**
- **Everything can be inspected.**
  - spectral.js's mixing model could be read, re-implemented for speed, and verified against the original to 1e-9.
  - Gemma's thinking mode could be switched off after measuring it: about 3× faster in a small run, and just as valid.
  - The model sits behind a small provider interface, so it can be swapped.

No closed model was run on the same prompts, so this repo makes no claim that Gemma beats one.

## Repo layout

- `web/`: the PWA (Vite + TypeScript, no UI framework). `src/color/` is the color engine; `src/ui/` the pages.
- `server/`: FastAPI with the Ollama provider, prompts, validation and the fallback planner.
- `scripts/`: `dev.sh`, the evals, and the request builder.
- `CLAUDE.md`: the build spec. `DEVLOG.md`: what was built each day, what broke, and how it was fixed.

Tests: `(cd web && npm test)` and `(cd server && .venv/bin/python -m pytest)`.

## Credits

[spectral.js](https://www.npmjs.com/package/spectral.js) (MIT) for pigment mixing,
[culori](https://culorijs.org) (MIT) for color spaces and CIEDE2000,
[Gemma](https://ai.google.dev/gemma) (Apache 2.0) through Ollama, FastAPI, and Vite.
Built with [Claude Code](https://claude.com/claude-code) as a pair programmer.

## License

MIT
