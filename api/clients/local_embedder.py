"""In-process local embedding client (ONNX via FastEmbed)."""

from __future__ import annotations

import os
import urllib.request
from pathlib import Path
from typing import Any, Dict, Optional, Sequence

from adalflow.core.model_client import ModelClient
from adalflow.core.types import EmbedderOutput, Embedding, ModelType

from api.logger import get_logger

log = get_logger(__name__)

DEFAULT_MODEL = "BAAI/bge-small-en-v1.5"
HF_MIRROR = "https://hf-mirror.com"
HF_REPO = {
    "BAAI/bge-small-en-v1.5": "qdrant/bge-small-en-v1.5-onnx-q",
}
MODEL_FILES = (
    "model_optimized.onnx",
    "config.json",
    "tokenizer.json",
    "tokenizer_config.json",
    "special_tokens_map.json",
    "vocab.txt",
    "ort_config.json",
)


class LocalEmbedderClient(ModelClient):
    """Runs a downloaded embedding model inside the API process.

    No Ollama daemon and no remote POST /embeddings endpoint are required.
    """

    def __init__(
        self,
        model: Optional[str] = None,
        cache_dir: Optional[str] = None,
        **kwargs,
    ):
        super().__init__()
        self._model_name = (model or "").strip() or DEFAULT_MODEL
        self._cache_dir = (
            cache_dir or os.environ.get("FASTEMBED_CACHE_PATH") or ""
        ).strip() or None
        self._model = None
        self._loaded_name = None

    def __getstate__(self):
        state = self.__dict__.copy()
        state["_model"] = None
        state["_loaded_name"] = None
        return state

    def __setstate__(self, state):
        self.__dict__.update(state)
        self._model = None
        self._loaded_name = None

    def to_dict(self, exclude: Optional[list] = None) -> Dict[str, Any]:
        exclude = list(exclude or [])
        for key in ("_model", "_loaded_name"):
            if key not in exclude:
                exclude.append(key)
        return super().to_dict(exclude=exclude)

    @classmethod
    def from_dict(cls, data: Dict[str, Any]):
        obj = super().from_dict(data)
        obj._model = None
        obj._loaded_name = None
        if not getattr(obj, "_model_name", None):
            obj._model_name = DEFAULT_MODEL
        return obj

    def _ensure_model(self, model_name: str) -> None:
        name = (model_name or self._model_name or DEFAULT_MODEL).strip()
        if self._model is not None and self._loaded_name == name:
            return
        self._model = _load_text_embedding(name, self._cache_dir)
        self._loaded_name = name
        log.info("Loaded local embedding model %s", name)

    def convert_inputs_to_api_kwargs(
        self,
        input: Optional[Any] = None,
        model_kwargs: Dict = None,
        model_type: ModelType = ModelType.UNDEFINED,
    ) -> Dict:
        if model_type != ModelType.EMBEDDER:
            raise ValueError(
                f"LocalEmbedderClient only supports EMBEDDER, got {model_type}"
            )
        final_kwargs = dict(model_kwargs or {})
        if isinstance(input, str):
            texts = [input]
        elif isinstance(input, Sequence):
            texts = [str(item) for item in input]
        else:
            raise TypeError("input must be a string or sequence of strings")
        final_kwargs["input"] = texts
        final_kwargs.setdefault("model", self._model_name)
        return final_kwargs

    def call(
        self,
        api_kwargs: Dict = None,
        model_type: ModelType = ModelType.UNDEFINED,
    ):
        if model_type != ModelType.EMBEDDER:
            raise ValueError("LocalEmbedderClient only supports EMBEDDER model type")
        api_kwargs = api_kwargs or {}
        texts = api_kwargs.get("input") or []
        if isinstance(texts, str):
            texts = [texts]
        if not texts:
            return {"embeddings": []}
        model_name = api_kwargs.get("model") or self._model_name
        self._ensure_model(model_name)
        vectors = []
        for item in self._model.embed(list(texts), parallel=None):
            vectors.append([float(value) for value in item])
        return {"embeddings": vectors}

    async def acall(
        self,
        api_kwargs: Dict = None,
        model_type: ModelType = ModelType.UNDEFINED,
    ):
        return self.call(api_kwargs, model_type)

    def parse_embedding_response(self, response) -> EmbedderOutput:
        try:
            vectors = (response or {}).get("embeddings") or []
            return EmbedderOutput(
                data=[
                    Embedding(embedding=emb, index=i) for i, emb in enumerate(vectors)
                ]
            )
        except Exception as e:
            log.error("Error parsing local embedding response: %s", e)
            return EmbedderOutput(data=[], error=str(e), raw_response=response)


def _default_cache_dir() -> Path:
    return Path.home() / ".cache" / "fastembed"


def _http_download(url: str, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(dest.suffix + ".tmp")
    request = urllib.request.Request(url, headers={"User-Agent": "deepwiki-open"})
    with urllib.request.urlopen(request, timeout=120) as response, open(tmp, "wb") as handle:
        while True:
            chunk = response.read(256 * 1024)
            if not chunk:
                break
            handle.write(chunk)
    tmp.replace(dest)


def ensure_local_model_files(model_name: str, cache_dir: Optional[str] = None) -> Path:
    """Download ONNX embedding files over HTTP (HuggingFace mirror first)."""
    repo = HF_REPO.get(model_name, "qdrant/bge-small-en-v1.5-onnx-q")
    dest = Path(cache_dir or _default_cache_dir()) / repo.replace("/", "--")
    dest.mkdir(parents=True, exist_ok=True)
    bases = [
        f"{HF_MIRROR}/{repo}/resolve/main",
        f"https://huggingface.co/{repo}/resolve/main",
    ]
    for name in MODEL_FILES:
        target = dest / name
        if target.exists() and target.stat().st_size > 0:
            continue
        last_error: Exception | None = None
        for base in bases:
            url = f"{base}/{name}"
            try:
                log.info("Downloading local embedding file %s", url)
                _http_download(url, target)
                last_error = None
                break
            except Exception as exc:
                last_error = exc
                log.warning("Download failed for %s: %s", url, exc)
        if last_error is not None and not (target.exists() and target.stat().st_size > 0):
            raise RuntimeError(f"Failed to download {name}: {last_error}") from last_error
    onnx = dest / "model_optimized.onnx"
    if not onnx.exists() or onnx.stat().st_size < 1000:
        raise RuntimeError(f"Local embedding model file missing: {onnx}")
    return dest


def _load_text_embedding(model_name: str, cache_dir: Optional[str]):
    try:
        from fastembed import TextEmbedding
    except ModuleNotFoundError as e:
        raise RuntimeError(
            "Local embeddings require the 'fastembed' package. "
            "Install it with: pip install fastembed"
        ) from e

    model_dir = ensure_local_model_files(model_name, cache_dir)
    kwargs = {
        "model_name": model_name,
        "specific_model_path": str(model_dir),
        "lazy_load": False,
        "threads": 1,
    }
    if cache_dir:
        kwargs["cache_dir"] = cache_dir
    try:
        return TextEmbedding(**kwargs)
    except Exception as exc:
        raise RuntimeError(
            f"Failed to load local embedding model '{model_name}' from {model_dir}. {exc}"
        ) from exc


try:
    from adalflow.utils.registry import EntityMapping

    EntityMapping.register("LocalEmbedderClient", LocalEmbedderClient)
except Exception:
    pass
