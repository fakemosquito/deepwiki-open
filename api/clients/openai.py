import inspect
import os
from collections.abc import Callable, Sequence
from typing import Any, Dict, Optional

import backoff
from adalflow.components.model_client.openai_client import (
    OpenAIClient as AdalOpenAIClient,
)
from adalflow.core.types import ModelType
from openai import (
    APITimeoutError,
    BadRequestError,
    InternalServerError,
    RateLimitError,
    UnprocessableEntityError,
)

_DEFAULT_BASE_URL = "https://api.openai.com/v1"
_LLM_TYPES = {ModelType.LLM, getattr(ModelType, "LLM_REASONING", ModelType.LLM)}
_RETRYABLE = (
    APITimeoutError,
    InternalServerError,
    RateLimitError,
    UnprocessableEntityError,
    BadRequestError,
)


def _is_llm(model_type: ModelType | None) -> bool:
    return model_type in _LLM_TYPES


class OpenAIClient(AdalOpenAIClient):
    """OpenAI-compatible client that honors OPENAI_BASE_URL and OPENAI_API_KEY.

    Recent adalflow builds call the Responses API (`/v1/responses`). Desktop
    gateways (and the connection test) expose Chat Completions instead, so this
    subclass keeps LLM calls on `chat.completions.create`.
    """

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

    def convert_inputs_to_api_kwargs(
        self,
        input: Optional[Any] = None,
        model_kwargs: Dict = None,
        model_type: ModelType = None,
    ) -> Dict:
        model_kwargs = model_kwargs or {}
        if not _is_llm(model_type):
            return super().convert_inputs_to_api_kwargs(
                input=input, model_kwargs=model_kwargs, model_type=model_type
            )

        api_kwargs = dict(model_kwargs)
        if isinstance(input, str):
            messages = [{"role": "user", "content": input}]
        elif isinstance(input, Sequence) and not isinstance(input, (str, bytes)):
            messages = list(input)
        elif input is None:
            messages = list(api_kwargs.get("messages") or [])
        else:
            messages = [{"role": "user", "content": str(input)}]
        api_kwargs["messages"] = messages
        api_kwargs.pop("input", None)
        return api_kwargs

    @backoff.on_exception(backoff.expo, _RETRYABLE, max_time=5)
    def call(self, api_kwargs: Dict = None, model_type: ModelType = None):
        api_kwargs = api_kwargs or {}
        if not _is_llm(model_type):
            return super().call(api_kwargs=api_kwargs, model_type=model_type)
        return self.sync_client.chat.completions.create(**api_kwargs)

    @backoff.on_exception(backoff.expo, _RETRYABLE, max_time=5)
    async def acall(self, api_kwargs: Dict = None, model_type: ModelType = None):
        api_kwargs = api_kwargs or {}
        if not _is_llm(model_type):
            return await super().acall(api_kwargs=api_kwargs, model_type=model_type)
        if self.async_client is None:
            self.async_client = self.init_async_client()
        return await self.async_client.chat.completions.create(**api_kwargs)
