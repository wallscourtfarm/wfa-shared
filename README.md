# wfa-shared

Shared branding, UI, and API utilities for Wallscourt Farm Academy Streamlit apps.

## Installation

Add to your `requirements.txt`:

```
git+https://github.com/wallscourtfarm/wfa-shared.git
```

## Usage

```python
from wfa_shared import logo_html, inject_wfa_css, year_colour, WFA_BLUE
from wfa_shared.api import get_anthropic_client, DEFAULT_MODEL

# Brand colours
colour = year_colour("Y3")  # "#c0157b"

# Streamlit header
st.markdown(logo_html("WFA Reading Resources"), unsafe_allow_html=True)
st.divider()

# CSS injection
inject_wfa_css(buttons=True, inputs=True, download=True)

# API client
client = get_anthropic_client()
response = client.messages.create(model=DEFAULT_MODEL, ...)
```

## Modules

- **brand** — `WFA_BLUE`, `YEAR_COLOURS`, `year_colour()`, `hex_to_rgb()`, `year_colour_rgb()`
- **logo** — `logo_html()` for Streamlit page headers
- **streamlit_css** — `wfa_css()` and `inject_wfa_css()` for branded theming
- **api** — `get_anthropic_client()` and `DEFAULT_MODEL`