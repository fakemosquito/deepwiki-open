import os
from collections.abc import Callable
from typing import Optional

from adalflow.components.model_client.openai_client import (
    OpenAIClient as AdalOpenAIClient,
)


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
    ):
        resolved = (base_url or os.getenv(env_base_url_name) or "").strip().rstrip("/")
        super().__init__(
            api_key=api_key,
            chat_completion_parser=chat_completion_parser,
            input_type=input_type,
            base_url=resolved or None,
            env_base_url_name=env_base_url_name,
            env_api_key_name=env_api_key_name,
        )
