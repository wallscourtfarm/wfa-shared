"""Shared Anthropic API client factory for WFA Streamlit apps."""

import os
import anthropic

# Ordered preference — first available model wins. Update the top entry when
# Anthropic releases a new Sonnet; the rest act as automatic fallbacks so
# tools keep working even when a model is deprecated.
MODEL_FALLBACKS = [
    "claude-sonnet-4-6",
    "claude-sonnet-4-5",
    "claude-3-5-sonnet-20241022",
]

DEFAULT_MODEL = MODEL_FALLBACKS[0]


def get_anthropic_client(api_key: str | None = None) -> anthropic.Anthropic:
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

    return anthropic.Anthropic(api_key=api_key)


def create_message(client: anthropic.Anthropic, **kwargs) -> anthropic.types.Message:
    """Call ``client.messages.create`` with automatic model fallback.

    Pass any kwargs you would normally pass to ``messages.create`` — except
    ``model``, which is handled here. The call is retried with each entry in
    ``MODEL_FALLBACKS`` until one succeeds or all are exhausted.

    Example::

        from wfa_shared.api import get_anthropic_client, create_message

        client = get_anthropic_client()
        msg = create_message(client, max_tokens=800,
                             messages=[{"role": "user", "content": "Hello"}])
    """
    last_exc = None
    for model in MODEL_FALLBACKS:
        try:
            return client.messages.create(model=model, **kwargs)
        except anthropic.NotFoundError as exc:
            last_exc = exc
            continue  # try next model
    raise last_exc
