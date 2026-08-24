import inspect
import os
from collections.abc import Callable
from typing import Optional

from adalflow.components.model_client.openai_client import (
    OpenAIClient as AdalOpenAIClient,
)

_DEFAULT_BASE_URL = "https://api.openai.com/v1"


class OpenAIClient(AdalOpenAIClient):
    """OpenAI-compatible client that honors OPENAI_BASE_URL and OPENAI_API_KEY."""

    def __init__(
        self,
        api_key: Optional[str] = None,
        chat_completion_parser: Optional[Callable] = None,
        input_type: str = "text",
        base_url: Optional[str] = None,
        env_base_url_name: str = "OPENAI_BASE_URL",
        env_api_key_name: str = "OPENAI_API_KEY",
        **kwargs,
    ):
        resolved = (base_url or os.getenv(env_base_url_name) or "").strip().rstrip("/")
        parent_kwargs = {
            "api_key": api_key,
            "input_type": input_type,
            "base_url": resolved or _DEFAULT_BASE_URL,
            "env_api_key_name": env_api_key_name,
            **kwargs,
        }
        # Older adalflow used chat_completion_parser; current builds renamed it.
        if chat_completion_parser is not None:
            parent_kwargs["chat_completion_parser"] = chat_completion_parser
            parent_kwargs["non_streaming_chat_completion_parser"] = (
                chat_completion_parser
            )

        accepted = inspect.signature(AdalOpenAIClient.__init__).parameters
        super().__init__(
            **{key: value for key, value in parent_kwargs.items() if key in accepted}
        )
