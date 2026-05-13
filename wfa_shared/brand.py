"""WFA brand colours and year-group colour mapping."""

WFA_BLUE = "#1798d3"

YEAR_COLOURS: dict[str, str] = {
    "Y1": "#e57d24",
    "Y2": "#2bae62",
    "Y3": "#c0157b",
    "Y4": "#1798d3",
    "Y5": "#e57d24",
    "Y6": "#2bae62",
}

DEFAULT_COLOUR = WFA_BLUE


def year_colour(year_group: str) -> str:
    """Return the hex colour for a year group, falling back to WFA blue."""
    return YEAR_COLOURS.get(year_group, DEFAULT_COLOUR)


def hex_to_rgb(hex_str: str) -> tuple[float, float, float]:
    """Convert a hex colour string to an (r, g, b) tuple with 0–1 range."""
    hex_str = hex_str.lstrip("#")
    r = int(hex_str[0:2], 16) / 255
    g = int(hex_str[2:4], 16) / 255
    b = int(hex_str[4:6], 16) / 255
    return (r, g, b)


def year_colour_rgb(year_group: str) -> tuple[float, float, float]:
    """Return the RGB tuple (0–1 range) for a year group, for ReportLab use."""
    return hex_to_rgb(year_colour(year_group))