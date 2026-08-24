from fastapi.testclient import TestClient

import api.routers.wiki as wiki_router
from api.schemas import WikiCacheData, WikiPage, WikiStructureModel


def _cache() -> WikiCacheData:
    return WikiCacheData(
        wiki_structure=WikiStructureModel(
            id="wiki",
            title="T",
            description="D",
            pages=[],
        ),
        generated_pages={
            "page-1": WikiPage(
                id="page-1",
                title="P1",
                content="ok",
                filePaths=[],
                importance="high",
                relatedPages=[],
            )
        },
    )


def _params(**overrides) -> dict[str, str]:
    params = {
        "owner": "o",
        "repo": "r",
        "repo_type": "github",
        "language": "en",
    }
    params.update(overrides)
    return params


def test_get_wiki_cache_miss_returns_null(monkeypatch):
    async def fake_read(*_a, **_k):
        return None

    monkeypatch.setattr(wiki_router, "read_wiki_cache", fake_read)
    from api.main import app

    with TestClient(app) as client:
        r = client.get("/api/wiki_cache", params=_params())
        assert r.status_code == 200, r.text
        assert r.json() is None


def test_get_wiki_cache_hit_returns_payload(monkeypatch):
    cache = _cache()

    async def fake_read(*_a, **_k):
        return cache

    monkeypatch.setattr(wiki_router, "read_wiki_cache", fake_read)
    from api.main import app

    with TestClient(app) as client:
        r = client.get("/api/wiki_cache", params=_params())
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["wiki_structure"]["id"] == "wiki"
        assert body["generated_pages"]["page-1"]["content"] == "ok"


def test_get_wiki_cache_falls_back_to_default_language(monkeypatch):
    seen: dict[str, str] = {}

    async def fake_read(owner, repo, repo_type, language):
        seen["language"] = language
        return None

    monkeypatch.setattr(wiki_router, "read_wiki_cache", fake_read)
    from api.main import app

    with TestClient(app) as client:
        r = client.get("/api/wiki_cache", params=_params(language="not-a-lang"))
        assert r.status_code == 200, r.text
        assert seen["language"] == "en"
