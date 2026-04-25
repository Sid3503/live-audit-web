"""
LLM provider with OpenAI (primary) and Google (fallback).

Usage:
    result, provider = invoke_with_fallback(messages, json_mode=True)
"""

import logging
import os
import time
from typing import Literal

from langchain_core.messages import BaseMessage

logger = logging.getLogger(__name__)

_DEFAULT_OPENAI_MODEL = "gpt-4o-mini"
_DEFAULT_LLM_MODEL = "gemini-2.0-flash"

Provider = Literal["openai", "google"]


def _openai_client(json_mode: bool):
    from langchain_openai import ChatOpenAI

    kwargs: dict = {
        "model": os.environ.get("OPENAI_MODEL", _DEFAULT_OPENAI_MODEL).strip() or _DEFAULT_OPENAI_MODEL,
        "api_key": os.environ["OPENAI_API_KEY"],
        "temperature": 0.2,
        "max_tokens": 4096,
    }
    if json_mode:
        kwargs["model_kwargs"] = {"response_format": {"type": "json_object"}}
    return ChatOpenAI(**kwargs)


def _google_client(json_mode: bool):
    from langchain_google_genai import ChatGoogleGenerativeAI

    kwargs: dict = {
        "model": os.environ.get("GEMINI_MODEL", _DEFAULT_LLM_MODEL).strip() or _DEFAULT_LLM_MODEL,
        "google_api_key": os.environ["GEMINI_API_KEY"],
        "temperature": 0.2,
        "max_output_tokens": 4096,
    }
    if json_mode:
        kwargs["model_kwargs"] = {"response_mime_type": "application/json"}
    return ChatGoogleGenerativeAI(**kwargs)


def invoke_with_fallback(
    messages: list[BaseMessage],
    *,
    json_mode: bool = False,
    max_tokens_override: int | None = None,
    temperature: float | None = None,
) -> tuple[str, Provider]:
    """
    Invoke LLM with OpenAI as primary and Google as fallback.

    Returns (content_string, provider_used).
    Raises RuntimeError if both providers fail.
    """
    openai_key = os.environ.get("OPENAI_API_KEY", "").strip()
    llm_key = os.environ.get("GEMINI_API_KEY", "").strip()

    providers: list[tuple[Provider, object]] = []
    if openai_key:
        providers.append(("openai", None))
    if llm_key:
        providers.append(("google", None))

    if not providers:
        raise RuntimeError("No LLM API key configured (OPENAI_API_KEY or GEMINI_API_KEY)")

    last_error: Exception | None = None
    for name, _ in providers:
        try:
            if name == "openai":
                client = _openai_client(json_mode)
            else:
                client = _google_client(json_mode)

            if temperature is not None:
                client = client.bind(temperature=temperature)

            if max_tokens_override is not None:
                if name == "openai":
                    client = client.bind(max_tokens=max_tokens_override)
                else:
                    client = client.bind(max_output_tokens=max_tokens_override)

            t0 = time.perf_counter()
            response = client.invoke(messages)
            elapsed = time.perf_counter() - t0

            content = getattr(response, "content", response)

            if isinstance(content, list):
                content = " ".join(str(x) for x in content)
            text = str(content).strip()
            if text:
                logger.info("LLM response from %s | %.2fs | %d chars", name, elapsed, len(text))
                return text, name

            raise ValueError("Empty response from model")

        except Exception as e:
            logger.warning("LLM provider %s failed: %s", name, e)
            last_error = e
            if name == "openai" and llm_key:
                logger.info("Falling back to Google LLM")

    raise RuntimeError(f"All LLM providers failed. Last error: {last_error}")


def invoke_with_vision(
    system_prompt: str,
    text_prompt: str,
    screenshot_data_url: str,
) -> tuple[str, Provider]:
    """
    Call the LLM with text + screenshot for visual grounding.
    Uses OpenAI vision API (gpt-4o-mini by default, override with OPENAI_VISION_MODEL).
    Falls back to text-only invoke_with_fallback if vision fails.
    """
    openai_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not openai_key:
        raise RuntimeError("Vision requires OPENAI_API_KEY")

    try:
        from openai import OpenAI

        # Strip data URL prefix — the OpenAI API accepts raw base64
        b64 = screenshot_data_url.split(",", 1)[1] if "," in screenshot_data_url else screenshot_data_url
        vision_model = os.environ.get("OPENAI_VISION_MODEL", "gpt-4o-mini")

        client = OpenAI(api_key=openai_key)
        t0 = time.perf_counter()
        response = client.chat.completions.create(
            model=vision_model,
            messages=[
                {"role": "system", "content": system_prompt},
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": text_prompt},
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/png;base64,{b64}",
                                "detail": "low",
                            },
                        },
                    ],
                },
            ],
            max_tokens=4096,
            temperature=0.2,
            response_format={"type": "json_object"},
        )
        content = response.choices[0].message.content or ""
        if not content.strip():
            raise ValueError("Empty vision response")
        elapsed = time.perf_counter() - t0
        logger.info("Vision response from openai/%s | %.2fs | %d chars", vision_model, elapsed, len(content))
        return content, "openai"

    except Exception as e:
        logger.warning("Vision call failed (%s) — falling back to text-only", e)
        from langchain_core.messages import HumanMessage, SystemMessage

        messages = [SystemMessage(content=system_prompt), HumanMessage(content=text_prompt)]
        return invoke_with_fallback(messages, json_mode=True)
