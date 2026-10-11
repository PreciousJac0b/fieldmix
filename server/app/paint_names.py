"""Common artist-paint names, used to catch the model naming a paint the painter doesn't have."""

from __future__ import annotations

# Fieldmix presets (web/src/color/paints.ts) plus other widely sold paint names.
KNOWN_PAINT_NAMES: tuple[str, ...] = (
    "Titanium White",
    "Zinc White",
    "Mars Black",
    "Ivory Black",
    "Lamp Black",
    "Cadmium Yellow Light Hue",
    "Cadmium Yellow",
    "Cadmium Yellow Medium",
    "Cadmium Orange",
    "Cadmium Red Hue",
    "Cadmium Red",
    "Cadmium Red Light",
    "Naphthol Red",
    "Alizarin Crimson Hue",
    "Alizarin Crimson",
    "Quinacridone Magenta",
    "Quinacridone Rose",
    "Permanent Rose",
    "Ultramarine Blue",
    "French Ultramarine",
    "Phthalo Blue",
    "Prussian Blue",
    "Cobalt Blue",
    "Cerulean Blue Hue",
    "Cerulean Blue",
    "Burnt Sienna",
    "Raw Sienna",
    "Burnt Umber",
    "Raw Umber",
    "Van Dyke Brown",
    "Yellow Ochre",
    "Naples Yellow",
    "Lemon Yellow",
    "Hansa Yellow",
    "Indian Yellow",
    "Dioxazine Purple",
    "Cobalt Violet",
    "Phthalo Green",
    "Sap Green",
    "Hooker's Green",
    "Viridian",
    "Chromium Oxide Green",
    "Payne's Grey",
    "Payne's Gray",
    "Venetian Red",
    "Indian Red",
)


def _core(name: str) -> str:
    """Lowercase name without a trailing ' hue' (student-grade suffix)."""
    n = name.lower().strip()
    return n[: -len(" hue")] if n.endswith(" hue") else n


def foreign_paint_names(text: str, palette_names: list[str]) -> list[str]:
    """Known paint names mentioned in `text` that are not in the painter's palette.

    A mention counts as "in the palette" when it matches part of a palette name, so
    "cadmium yellow" is fine when the palette has "Cadmium Yellow Light Hue".
    """
    lowered = text.lower()
    palette = [p.lower() for p in palette_names]
    found: list[str] = []
    for name in KNOWN_PAINT_NAMES:
        core = _core(name)
        if core in lowered and not any(core in p for p in palette) and not any(_core(p) in core for p in palette):
            found.append(name)
    # Drop shorter names covered by a longer foreign match ("Cadmium Red" inside "Cadmium Red Light").
    return [f for f in found if not any(f != g and _core(f) in _core(g) for g in found)]
