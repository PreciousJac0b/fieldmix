"""Pydantic models for the API contract in CLAUDE.md.

`PlanOutput` is the model-output-only shape (labels + steps). Its JSON schema is what
the model is asked to produce; `source` is added by the server in `PlanResponse`.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

Mode = Literal["scene", "artwork"]
Medium = Literal["acrylic", "watercolor", "oil", "gouache"]


class PaletteItem(BaseModel):
    id: str
    name: str
    hex: str


class Region(BaseModel):
    id: int
    hex: str
    lab: tuple[float, float, float]
    area_pct: float
    centroid: tuple[float, float]
    bbox: tuple[float, float, float, float]


class RecipePart(BaseModel):
    paint_id: str
    parts: int = Field(ge=1)


class Recipe(BaseModel):
    region_id: int
    parts: list[RecipePart]
    result_hex: str
    delta_e: float


class PlanRequest(BaseModel):
    image_b64: str = ""
    mode: Mode = "scene"
    medium: Medium = "acrylic"
    minutes: int = Field(default=60, ge=5, le=600)
    palette: list[PaletteItem]
    regions: list[Region] = Field(min_length=1)
    recipes: list[Recipe] = []


class Label(BaseModel):
    region_id: int
    label: str


class Step(BaseModel):
    order: int
    region_ids: list[int]
    title: str
    instruction: str
    technique_tip: str
    est_minutes: int


class PlanOutput(BaseModel):
    """What the model must return."""

    labels: list[Label]
    steps: list[Step]


class PlanResponse(PlanOutput):
    source: Literal["gemma", "fallback"]


class AskRequest(BaseModel):
    question: str = Field(min_length=1, max_length=500)
    plan: PlanResponse
    current_step: int  # the step's `order`
    image_b64: str | None = None


class AskResponse(BaseModel):
    answer: str
