from types import SimpleNamespace

from adalflow.core.types import ModelType

from api.clients import LiteLLMClient, OpenAIClient
from api.config import configs, get_embedder


def test_constructs_with_legacy_parser_and_env_base_url_kwargs(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
    client = OpenAIClient(
        api_key="sk-test",
        chat_completion_parser=lambda value: value,
        env_base_url_name="OPENAI_BASE_URL",
        base_url="https://example.com/v1",
    )
    assert client.base_url.rstrip("/") == "https://example.com/v1"


def test_constructs_with_embedder_initialize_kwargs(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
    client = OpenAIClient(api_key="sk-test", base_url="https://proxy.example/v1")
    assert client.base_url.rstrip("/") == "https://proxy.example/v1"


def test_resolves_base_url_from_named_env(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
    monkeypatch.setenv("CUSTOM_OPENAI_URL", "https://custom.example/v1")
    client = OpenAIClient(env_base_url_name="CUSTOM_OPENAI_URL")
    assert client.base_url.rstrip("/") == "https://custom.example/v1"


def test_get_embedder_accepts_desktop_initialize_kwargs(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
    monkeypatch.setitem(
        configs,
        "embedder",
        {
            "model_client": OpenAIClient,
            "initialize_kwargs": {
                "api_key": "sk-test",
                "base_url": "https://proxy.example/v1",
            },
            "model_kwargs": {"model": "text-embedding-3-small"},
            "batch_size": 10,
        },
    )
    embedder = get_embedder(embedder_type="openai")
    assert embedder.model_client.base_url.rstrip("/") == "https://proxy.example/v1"


def test_litellm_client_constructs_with_legacy_kwargs(monkeypatch):
    monkeypatch.setenv("LITELLM_API_KEY", "sk-test")
    client = LiteLLMClient(
        api_key="sk-test",
        chat_completion_parser=lambda value: value,
        env_base_url_name="LITELLM_BASE_URL",
        base_url="http://localhost:4000",
    )
    assert client.base_url.rstrip("/").endswith("/v1")


def test_llm_kwargs_use_chat_completions_messages(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
    client = OpenAIClient(api_key="sk-test", base_url="https://proxy.example/v1")
    kwargs = client.convert_inputs_to_api_kwargs(
        input="hello wiki",
        model_kwargs={"model": "glm-5.2", "stream": True, "temperature": 0.7},
        model_type=ModelType.LLM,
    )
    assert kwargs["messages"] == [{"role": "user", "content": "hello wiki"}]
    assert "input" not in kwargs
    assert kwargs["model"] == "glm-5.2"
    assert kwargs["stream"] is True


def test_llm_call_uses_chat_completions_not_responses(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
    client = OpenAIClient(api_key="sk-test", base_url="https://proxy.example/v1")
    captured = {}

    def fake_create(**kwargs):
        captured["kwargs"] = kwargs
        return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content="ok"))])

    monkeypatch.setattr(client.sync_client.chat.completions, "create", fake_create)

    def fail_responses(**kwargs):
        raise AssertionError("LLM calls must not use the Responses API")

    monkeypatch.setattr(client.sync_client.responses, "create", fail_responses)

    client.call(
        api_kwargs={"model": "glm-5.2", "messages": [{"role": "user", "content": "hi"}]},
        model_type=ModelType.LLM,
    )
    assert captured["kwargs"]["messages"][0]["content"] == "hi"
