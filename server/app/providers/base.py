"""Provider interface plus the shared plan/ask flow: prompt, validate, retry once, fall back.

Concrete providers (Ollama, Gemini) only implement `chat`, the transport call.
"""

from __future__ import annotations

import json
import re
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from pydantic import ValidationError

from ..calllog import log_model_call
from ..fallback import fallback_plan
from ..schemas import AskRequest, PlanOutput, PlanRequest, PlanResponse
from ..validate import find_ratio_phrases, normalize_plan, validate_plan

PROMPTS = Path(__file__).resolve().parents[1] / "prompts"
PLAN_SCHEMA: dict[str, Any] = PlanOutput.model_json_schema()
ASK_WORD_LIMIT = 80
ASK_FALLBACK = (
    "I couldn't come up with a good answer just now. Follow the recipe on screen, "
    "do a test dab on the canvas edge, and use the Too light, Too dark, Too dull "
    "or Too bright buttons to adjust."
)


class ProviderError(Exception):
    """The model could not be reached or returned an error (not a content problem)."""


@dataclass
class Message:
    role: str  # "system" | "user" | "assistant"
    content: str
    image_b64: str | None = None


def _relative_position(x: float, y: float, width: float, height: float) -> str:
    row = "top" if y < height / 3 else "middle" if y < 2 * height / 3 else "bottom"
    col = "left" if x < width / 3 else "center" if x < 2 * width / 3 else "right"
    return f"{row} {col}"


def build_plan_prompt(req: PlanRequest) -> str:
    """The user message for /api/plan: everything the model needs except the image."""
    width = max(r.bbox[0] + r.bbox[2] for r in req.regions) or 1
    height = max(r.bbox[1] + r.bbox[3] for r in req.regions) or 1
    names = {p.id: p.name for p in req.palette}
    recipes = {rec.region_id: rec for rec in req.recipes}
    lines = [
        f"Mode: {req.mode}. Medium: {req.medium}. Minutes available: {req.minutes}.",
        "Palette: " + ", ".join(p.name for p in req.palette) + ".",
        "",
        "Regions (id: color, lightness 0-100, share of the picture, position):",
    ]
    for r in req.regions:
        pos = _relative_position(r.centroid[0], r.centroid[1], width, height)
        lines.append(f"- {r.id}: {r.hex}, lightness {r.lab[0]:.0f}, {r.area_pct:.0f}% of the picture, {pos}")
    if recipes:
        lines += ["", "Paints each region's recipe uses (the app shows the painter the exact amounts):"]
        for r in req.regions:
            rec = recipes.get(r.id)
            if rec:
                paints = ", ".join(names.get(p.paint_id, p.paint_id) for p in rec.parts)
                quality = "good match" if rec.delta_e < 5 else "fair match" if rec.delta_e <= 10 else "closest possible"
                lines.append(f"- region {r.id}: {paints} ({quality})")
    lines += ["", "Label every region and plan the painting steps."]
    return "\n".join(lines)


def build_ask_prompt(req: AskRequest) -> str:
    """The user message for /api/ask."""
    plan = req.plan
    labels = ", ".join(f"{lab.region_id} = {lab.label}" for lab in plan.labels)
    steps = "\n".join(f"{s.order}. {s.title}: {s.instruction}" for s in plan.steps)
    current = next((s for s in plan.steps if s.order == req.current_step), None)
    current_text = f"{current.order}. {current.title}: {current.instruction}" if current else "(unknown step)"
    photo = "\nA photo of the painting in progress is attached." if req.image_b64 else ""
    return (
        f"Regions: {labels}\n\nPlan:\n{steps}\n\nCurrent step: {current_text}{photo}\n\n"
        f"Painter's question: {req.question}"
    )


PREMATURE_CLOSE = re.compile(r'\]\s*\}\s*,\s*"steps"\s*:')


def _extract_json(raw: str) -> str:
    """Return the first complete JSON object in `raw`.

    Handles a ```json fence and stray text after the object (without constrained
    decoding, Gemma occasionally adds an extra closing brace). Content is still
    validated against the schema afterwards.
    """
    m = re.search(r"```(?:json)?\s*(.*?)```", raw, re.DOTALL)
    text = m.group(1) if m else raw
    try:
        json.loads(text)
        return text
    except json.JSONDecodeError:
        pass
    # Observed Gemma slip: closing the top-level object right after "labels",
    # as in `..."label": "x"}]}, "steps": [...]}`. For this schema, `]}` before
    # `, "steps"` can only mean that, so drop the stray brace.
    text = PREMATURE_CLOSE.sub('], "steps":', text)
    start = text.find("{")
    if start < 0:
        return text
    try:
        _, end = json.JSONDecoder().raw_decode(text, start)
    except json.JSONDecodeError:
        return text
    return text[start:end]


def trim_words(text: str, limit: int = ASK_WORD_LIMIT) -> str:
    """Trim to at most `limit` words, ending at a sentence boundary when possible."""
    words = text.split()
    if len(words) <= limit:
        return " ".join(words)
    cut = " ".join(words[:limit])
    end = max(cut.rfind(". "), cut.rfind("! "), cut.rfind("? "))
    return cut[: end + 1] if end > len(cut) // 2 else cut.rstrip(",;:") + "…"


class Provider(ABC):
    """A model backend. Subclasses implement `chat`; `plan` and `ask` are shared."""

    name: str = "base"
    model: str = ""

    @abstractmethod
    async def chat(self, messages: list[Message], schema: dict[str, Any] | None = None) -> str:
        """Send messages (the last user message may carry an image) and return the text reply.

        Raise ProviderError for transport failures.
        """

    def _system(self, prompt_file: str) -> Message:
        return Message("system", (PROMPTS / prompt_file).read_text())

    async def plan(self, req: PlanRequest) -> PlanResponse:
        """Plan with the model; retry once with the validation errors; else use the fallback."""
        start = time.perf_counter()
        messages = [self._system("plan.md"), Message("user", build_plan_prompt(req), req.image_b64 or None)]
        problems: list[str] = []
        failed_replies: list[str] = []
        attempts = 0
        error: str | None = None
        for attempts in (1, 2):
            try:
                raw = await self.chat(messages, PLAN_SCHEMA)
            except ProviderError as exc:
                error = str(exc)
                break  # no point retrying a transport failure
            try:
                out = PlanOutput.model_validate_json(_extract_json(raw))
                problems = validate_plan(out, req)
            except (ValidationError, json.JSONDecodeError) as exc:
                problems = [f"the reply was not valid JSON for the schema: {exc}"]
            if not problems:
                self._log("plan", start, attempts, fallback=False)
                return PlanResponse(**normalize_plan(out, req).model_dump(), source="gemma")
            failed_replies.append(raw[:4000])
            messages += [
                Message("assistant", raw),
                Message(
                    "user",
                    "Your plan failed validation:\n- " + "\n- ".join(problems) + "\nReturn the full corrected JSON.",
                ),
            ]
        self._log("plan", start, attempts, fallback=True, problems=problems, error=error, failed_replies=failed_replies)
        return PlanResponse(**fallback_plan(req).model_dump(), source="fallback")

    async def ask(self, req: AskRequest) -> str:
        """Answer a mid-session question in under 80 words, with the same content checks."""
        start = time.perf_counter()
        messages = [self._system("ask.md"), Message("user", build_ask_prompt(req), req.image_b64 or None)]
        attempts = 0
        error: str | None = None
        problems: list[str] = []
        for attempts in (1, 2):
            try:
                raw = (await self.chat(messages)).strip()
            except ProviderError as exc:
                error = str(exc)
                break
            # AskRequest carries no palette, so only the ratio check applies to answers.
            problems = find_ratio_phrases(raw)
            if raw and not problems:
                self._log("ask", start, attempts, fallback=False)
                return trim_words(raw)
            messages += [
                Message("assistant", raw),
                Message("user", "Don't give amounts or ratios; the recipe is on screen. Answer again in under 80 words."),
            ]
        self._log("ask", start, attempts, fallback=True, problems=problems, error=error)
        return ASK_FALLBACK

    def _log(self, endpoint: str, start: float, attempts: int, fallback: bool, **extra: Any) -> None:
        log_model_call(
            endpoint=endpoint,
            provider=self.name,
            model=self.model,
            latency_ms=round((time.perf_counter() - start) * 1000),
            attempts=attempts,
            fallback=fallback,
            structured_output=getattr(self, "structured_output", None),
            **{k: v for k, v in extra.items() if v},
        )
