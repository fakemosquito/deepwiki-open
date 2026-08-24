from types import SimpleNamespace

import pytest

from api.chat import ChatStreamer
from api.chat._stream import (
    AnthropicChatStreamer,
    AzureChatStreamer,
    BedrockChatStreamer,
    DashScopeChatStreamer,
    GoogleGenerativeChatStreamer,
    LiteLLMChatStreamer,
    OllamaChatStreamer,
    OpenAIChatStreamer,
    OpenRouterChatStreamer,
    extract_openai_compat_text,
)


@pytest.mark.parametrize(
    "provider, expected",
    [
        ("ollama", OllamaChatStreamer),
        ("openrouter", OpenRouterChatStreamer),
        ("openai", OpenAIChatStreamer),
        ("azure", AzureChatStreamer),
        ("bedrock", BedrockChatStreamer),
        ("dashscope", DashScopeChatStreamer),
        ("google", GoogleGenerativeChatStreamer),
        ("litellm", LiteLLMChatStreamer),
        ("anthropic", AnthropicChatStreamer),
    ],
)
def test_every_provider_is_registered(provider, expected):
    assert ChatStreamer._registry[provider] is expected


@pytest.mark.parametrize(
    "provider, expected",
    [
        ("ollama", OllamaChatStreamer),
        ("openrouter", OpenRouterChatStreamer),
        ("openai", OpenAIChatStreamer),
        ("azure", AzureChatStreamer),
        ("bedrock", BedrockChatStreamer),
        ("dashscope", DashScopeChatStreamer),
        ("google", GoogleGenerativeChatStreamer),
        ("litellm", LiteLLMChatStreamer),
        ("anthropic", AnthropicChatStreamer),
    ],
)
def test_create_returns_correct_subclass(monkeypatch, provider, expected):
    monkeypatch.setattr(expected, "__init__", lambda self, **kw: None)
    s = ChatStreamer.create(provider=provider, model="m", model_config={"model": "m"})
    assert isinstance(s, expected)


def test_create_unknown_provider_raises():
    with pytest.raises(RuntimeError, match="not registered"):
        ChatStreamer.create(provider="nope", model=None, model_config={})


class _PydanticLikeEvent:
    type = "response.created"

    def __getattr__(self, item):
        raise AttributeError(
            f"{type(self).__name__!r} object has no attribute {item!r}"
        )


def test_extract_text_from_chat_completion_chunk():
    chunk = SimpleNamespace(
        choices=[SimpleNamespace(delta=SimpleNamespace(content="wiki"))]
    )
    assert extract_openai_compat_text(chunk) == "wiki"


def test_extract_text_skips_response_created_event():
    assert extract_openai_compat_text(_PydanticLikeEvent()) is None


def test_extract_text_from_response_output_text_delta():
    chunk = SimpleNamespace(type="response.output_text.delta", delta="page-1")
    assert extract_openai_compat_text(chunk) == "page-1"


@pytest.mark.asyncio
async def test_openai_streamer_ignores_response_created_then_yields_text():
    streamer = OpenAIChatStreamer.__new__(OpenAIChatStreamer)

    class _Client:
        def convert_inputs_to_api_kwargs(self, input, model_kwargs, model_type):
            return {"model": "glm-5.2", "messages": [{"role": "user", "content": input}]}

        async def acall(self, api_kwargs, model_type):
            async def _gen():
                yield _PydanticLikeEvent()
                yield SimpleNamespace(
                    choices=[SimpleNamespace(delta=SimpleNamespace(content="<wiki"))]
                )
                yield SimpleNamespace(
                    choices=[SimpleNamespace(delta=SimpleNamespace(content="_structure>"))]
                )

            return _gen()

    streamer.client = _Client()
    streamer.model_kwargs = {"model": "glm-5.2", "stream": True}

    parts = []
    async for text in streamer.respond_stream("build wiki"):
        parts.append(text)
    assert "".join(parts) == "<wiki_structure>"
