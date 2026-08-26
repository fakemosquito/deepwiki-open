import os
from collections.abc import Sequence
from typing import Any, Callable, Dict, Optional

import backoff
from adalflow.core.types import ModelType
from openai import AsyncOpenAI, OpenAI

from .openai import OpenAIClient, _RETRYABLE, _is_llm, _llm_input_payload


class LiteLLMClient(OpenAIClient):
    """
    LiteLLM OpenAI-compatible client.

    LiteLLM gateways typically expose Chat Completions, so LLM calls stay on
    `chat.completions.create` even though OpenAIClient uses the Responses API.

    Expected environment variables:

    LITELLM_BASE_URL=http://litellm:4000
    LITELLM_API_KEY=sk-1234

    Example model names:
        openai/gpt-4o
        anthropic/claude-3-5-sonnet
        gemini/gemini-2.5-pro
        ollama/llama3
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        chat_completion_parser: Optional[Callable] = None,
        input_type: str = "text",
        base_url: Optional[str] = None,
        env_base_url_name: str = "LITELLM_BASE_URL",
        env_api_key_name: str = "LITELLM_API_KEY",
    ):
        resolved_base_url = base_url or os.getenv(
            env_base_url_name, "http://localhost:4000"
        )
        if not resolved_base_url.endswith("/v1"):
            resolved_base_url = f"{resolved_base_url.rstrip('/')}/v1"
        super().__init__(
            api_key=api_key,
            chat_completion_parser=chat_completion_parser,
            input_type=input_type,
            base_url=resolved_base_url,
            env_base_url_name=env_base_url_name,
            env_api_key_name=env_api_key_name,
        )

    def init_sync_client(self):
        """
        Initialize synchronous LiteLLM OpenAI-compatible client.
        """
        api_key = self._api_key or os.getenv(self._env_api_key_name, "dummy")
        return OpenAI(
            api_key=api_key,
            base_url=self.base_url,
        )

    def init_async_client(self):
        """
        Initialize asynchronous LiteLLM OpenAI-compatible client.
        """
        api_key = self._api_key or os.getenv(self._env_api_key_name, "dummy")
        return AsyncOpenAI(
            api_key=api_key,
            base_url=self.base_url,
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
        payload = _llm_input_payload(input, api_kwargs)
        if isinstance(payload, str):
            messages = [{"role": "user", "content": payload}]
        elif isinstance(payload, Sequence):
            messages = list(payload)
        else:
            messages = [{"role": "user", "content": str(payload)}]
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
