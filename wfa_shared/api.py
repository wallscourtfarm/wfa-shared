"""Shared Anthropic API client factory for WFA Streamlit apps."""

import os

DEFAULT_MODEL = "claude-sonnet-4-20250514"


def get_anthropic_client(api_key: str | None = None):
    """Return an ``anthropic.Anthropic`` client.

    Resolution order for the API key:
    1. Explicit *api_key* argument
    2. ``st.secrets["ANTHROPIC_API_KEY"]`` (if Streamlit is running)
    3. ``ANTHROPIC_API_KEY`` environment variable

    Raises ``EnvironmentError`` if no key is found.
    """
    if api_key is None:
        try:
            import streamlit as st
            api_key = st.secrets.get("ANTHROPIC_API_KEY")
        except Exception:
            pass

    if api_key is None:
        api_key = os.environ.get("ANTHROPIC_API_KEY")

    if not api_key:
        raise EnvironmentError(
            "No Anthropic API key found. Set ANTHROPIC_API_KEY in "
            "Streamlit secrets or as an environment variable."
        )

    import anthropic
    return anthropic.Anthropic(api_key=api_key)