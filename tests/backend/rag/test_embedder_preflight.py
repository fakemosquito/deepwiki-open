from types import SimpleNamespace

import pytest
from adalflow.core.types import Document

from api.rag.pipeline import (
    EmbeddingFailedError,
    _embedding_vector_length,
    _summarize_embedder_failure,
    assert_embedder_ready,
)


def test_summarize_html_404():
    message = _summarize_embedder_failure(
        output=SimpleNamespace(error="<html>404 Not Found</html>", raw_response=None)
    )
    assert "404" in message
    assert "embeddings" in message.lower()


def test_assert_embedder_ready_accepts_vectors():
    class OkEmbedder:
        def __call__(self, text):
            return SimpleNamespace(data=[SimpleNamespace(embedding=[0.1, 0.2, 0.3])])

    assert_embedder_ready(OkEmbedder())


def test_assert_embedder_ready_rejects_empty_html_404():
    class BadEmbedder:
        def __call__(self, text):
            return SimpleNamespace(
                data=[],
                error="<html><h1>404 Not Found</h1></html>",
                raw_response=None,
            )

    with pytest.raises(EmbeddingFailedError, match="404"):
        assert_embedder_ready(BadEmbedder())


def test_assert_embedder_ready_wraps_exceptions():
    class BoomEmbedder:
        def __call__(self, text):
            raise RuntimeError("connection refused")

    with pytest.raises(EmbeddingFailedError, match="connection refused"):
        assert_embedder_ready(BoomEmbedder())


def test_embedding_vector_length_ignores_strings():
    string_doc = Document(text="x", vector="not-a-vector", meta_data={})
    vector_doc = Document(text="x", vector=[0.1, 0.2], meta_data={})
    assert _embedding_vector_length(string_doc) == 0
    assert _embedding_vector_length(vector_doc) == 2
