import pytest
from adalflow.core.types import ModelType

from api.clients.local_embedder import DEFAULT_MODEL, LocalEmbedderClient
from api.rag.pipeline import assert_embedder_ready


class FakeModel:
    def embed(self, texts, **kwargs):
        return [[0.1, 0.2, 0.3] for _ in texts]


def test_local_embedder_returns_vectors(monkeypatch):
    client = LocalEmbedderClient(model=DEFAULT_MODEL)
    monkeypatch.setattr(client, "_ensure_model", lambda name: None)
    client._model = FakeModel()
    client._loaded_name = DEFAULT_MODEL

    kwargs = client.convert_inputs_to_api_kwargs(
        "hello", {"model": DEFAULT_MODEL}, ModelType.EMBEDDER
    )
    raw = client.call(kwargs, ModelType.EMBEDDER)
    parsed = client.parse_embedding_response(raw)

    assert parsed.data
    assert parsed.data[0].embedding == [0.1, 0.2, 0.3]


def test_assert_embedder_ready_accepts_local_client(monkeypatch):
    client = LocalEmbedderClient()
    monkeypatch.setattr(client, "_ensure_model", lambda name: None)
    client._model = FakeModel()

    class Wrapper:
        def __call__(self, text):
            kwargs = client.convert_inputs_to_api_kwargs(
                text, {"model": DEFAULT_MODEL}, ModelType.EMBEDDER
            )
            raw = client.call(kwargs, ModelType.EMBEDDER)
            return client.parse_embedding_response(raw)

    assert_embedder_ready(Wrapper())


def test_local_embedder_rejects_non_embedder_type():
    client = LocalEmbedderClient()
    with pytest.raises(ValueError, match="EMBEDDER"):
        client.convert_inputs_to_api_kwargs("x", {}, ModelType.LLM)


def test_local_embedder_pickle_drops_onnx_session():
    import pickle

    class UnpicklableSession:
        def __getstate__(self):
            raise TypeError(
                "cannot pickle 'onnxruntime.capi.onnxruntime_pybind11_state.InferenceSession' object"
            )

    client = LocalEmbedderClient(model=DEFAULT_MODEL)
    client._model = UnpicklableSession()
    client._loaded_name = DEFAULT_MODEL

    restored = pickle.loads(pickle.dumps(client))
    assert restored._model is None
    assert restored._model_name == DEFAULT_MODEL
    data = client.to_dict()
    assert "_model" not in data.get("data", {})
    restored_from_dict = LocalEmbedderClient.from_dict(data)
    assert restored_from_dict._model is None
    assert restored_from_dict._model_name == DEFAULT_MODEL

