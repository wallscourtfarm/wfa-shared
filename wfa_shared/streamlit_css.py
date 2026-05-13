"""WFA-branded Streamlit CSS injection."""

from .brand import WFA_BLUE


def wfa_css(
    *,
    buttons: bool = True,
    inputs: bool = True,
    download: bool = True,
    note: bool = False,
) -> str:
    """Return a CSS string for WFA-branded Streamlit theming.

    Each section can be toggled independently so apps only load what they use.
    """
    blue = WFA_BLUE
    blue_dark = "#1280b8"
    blue_light = "#f0f8ff"

    parts: list[str] = [
        f'div[data-testid="stMainBlockContainer"] {{ max-width: 860px; margin: 0 auto; }}'
    ]

    if buttons:
        parts.append(
            f'div[data-testid="stButton"] button {{'
            f'  background-color: {blue} !important;'
            f'  border-color: {blue} !important;'
            f'  color: #ffffff !important;'
            f'}}'
            f'div[data-testid="stButton"] button:hover {{'
            f'  background-color: {blue_dark} !important;'
            f'  border-color: {blue_dark} !important;'
            f'}}'
        )

    if download:
        parts.append(
            f'div[data-testid="stDownloadButton"] > button {{'
            f'  background: #ffffff !important;'
            f'  border: 1.5px solid {blue} !important;'
            f'  color: {blue} !important;'
            f'}}'
            f'div[data-testid="stDownloadButton"] > button:hover {{'
            f'  background: {blue_light} !important;'
            f'}}'
        )

    if inputs:
        parts.append(
            f'[data-baseweb="select"] > div {{ border-color: #cccccc !important; }}'
            f'[data-baseweb="select"] > div:focus-within {{'
            f'  border-color: {blue} !important;'
            f'  box-shadow: 0 0 0 3px {blue} !important;'
            f'}}'
            f'[data-baseweb="input"] > div, [data-baseweb="textarea"] > div {{'
            f'  border-color: #cccccc !important;'
            f'}}'
            f'[data-baseweb="input"] > div:focus-within, [data-baseweb="textarea"] > div:focus-within {{'
            f'  border-color: {blue} !important;'
            f'  box-shadow: 0 0 0 3px {blue} !important;'
            f'}}'
            f'[data-baseweb="radio"] [data-checked="true"] > div,'
            f'[data-baseweb="checkbox"] [data-checked="true"] > div {{'
            f'  background-color: {blue} !important;'
            f'  border-color: {blue} !important;'
            f'}}'
            f'div[data-testid="stProgressBar"] > div > div {{'
            f'  background-color: {blue} !important;'
            f'}}'
            f'button[data-baseweb="tab"][aria-selected="true"] {{'
            f'  border-bottom-color: {blue} !important;'
            f'  color: {blue} !important;'
            f'}}'
        )

    if note:
        parts.append(
            f'.note {{'
            f'  background: #eaf6fb;'
            f'  border-left: 4px solid {blue};'
            f'  padding: 0.6rem 1rem;'
            f'  border-radius: 4px;'
            f'  font-size: 0.9rem;'
            f'  color: #0e2841;'
            f'  margin-bottom: 1rem;'
            f'}}'
        )

    return "<style>\n" + "\n".join(parts) + "\n</style>"


def inject_wfa_css(**kwargs) -> None:
    """Inject WFA-branded CSS into a Streamlit app via ``st.markdown``."""
    import streamlit as st
    st.markdown(wfa_css(**kwargs), unsafe_allow_html=True)