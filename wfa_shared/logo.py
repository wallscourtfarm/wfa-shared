"""WFA logo embedding for Streamlit app headers."""

import base64
from pathlib import Path

_SEARCH_ORDER = [
    ("wfa_logo.webp", "image/webp"),
    ("wfa_logo.png", "image/png"),
    ("wfa_logo.jpg", "image/jpeg"),
]


def logo_html(
    title: str,
    logo_path: str | Path | None = None,
    height: str = "60px",
) -> str:
    """Return an HTML string for a WFA-branded Streamlit page header.

    Searches for logo files in ``assets/`` if *logo_path* is not given.
    Falls back to text-only if no logo file is found.
    """
    if logo_path is not None:
        p = Path(logo_path)
        if p.exists():
            b64 = base64.b64encode(p.read_bytes()).decode()
            mime = _mime_for(p)
            return (
                f'<div style="display:flex;align-items:center;gap:18px;'
                f'margin-bottom:6px;">'
                f'<img src="data:{mime};base64,{b64}" '
                f'style="height:{height};width:auto;">'
                f'<span style="font-size:1.75rem;font-weight:700;'
                f'color:#1798d3;">{title}</span></div>'
            )

    # Auto-search in assets/
    for filename, mime in _SEARCH_ORDER:
        p = Path("assets") / filename
        if p.exists():
            b64 = base64.b64encode(p.read_bytes()).decode()
            return (
                f'<div style="display:flex;align-items:center;gap:18px;'
                f'margin-bottom:6px;">'
                f'<img src="data:{mime};base64,{b64}" '
                f'style="height:{height};width:auto;">'
                f'<span style="font-size:1.75rem;font-weight:700;'
                f'color:#1798d3;">{title}</span></div>'
            )

    return (
        f'<span style="font-size:1.75rem;font-weight:700;'
        f'color:#1798d3;">{title}</span>'
    )


def _mime_for(path: Path) -> str:
    suffix = path.suffix.lower()
    return {
        ".webp": "image/webp",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
    }.get(suffix, "application/octet-stream")