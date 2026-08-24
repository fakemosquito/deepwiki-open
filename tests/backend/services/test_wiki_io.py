import json

import pytest

import api.services.wiki.io as wiki_io
from api.schemas import RepoInfo, WikiCacheData, WikiPage, WikiStructureModel


def _page(page_id: str, content: str) -> dict:
    return {
        "id": page_id,
        "title": page_id,
        "content": content,
        "filePaths": [],
        "importance": "high",
        "relatedPages": [],
    }


def test_preview_wiki_cache_keeps_first_page_only():
    data = {
        "wiki_structure": {
            "id": "w",
            "title": "T",
            "description": "D",
            "pages": [_page("p1", "AAA"), _page("p2", "BBB")],
        },
        "generated_pages": {
            "p1": _page("p1", "AAA"),
            "p2": _page("p2", "BBB"),
        },
        "provider": "local",
    }
    preview = wiki_io.preview_wiki_cache(data)
    assert preview["generated_pages"]["p1"]["content"] == "AAA"
    assert preview["generated_pages"]["p2"]["content"] == ""
    assert preview["wiki_structure"]["pages"][0]["content"] == ""
    assert preview["provider"] == "local"


@pytest.mark.asyncio
async def test_list_wiki_cache_reads_local_path_from_json(tmp_path, monkeypatch):
    monkeypatch.setattr(wiki_io, "WIKI_CACHE_DIR", str(tmp_path))
    wiki_io.clear_wiki_json_cache()
    payload = {
        "wiki_structure": {
            "id": "w",
            "title": "T",
            "description": "D",
            "pages": [],
        },
        "generated_pages": {"p1": _page("p1", "x" * 2000)},
        "repo": {
            "owner": "local",
            "repo": "fakereel_player",
            "type": "local",
            "localPath": "D:/code/fakereel_player",
        },
    }
    path = tmp_path / "deepwiki_cache_local_local_fakereel_player_zh.json"
    path.write_text(json.dumps(payload), encoding="utf-8")

    entries = await wiki_io.list_wiki_cache()
    assert len(entries) == 1
    assert entries[0].owner == "local"
    assert entries[0].repo == "fakereel_player"
    assert entries[0].language == "zh"
    assert entries[0].repo_url == "D:/code/fakereel_player"


@pytest.mark.asyncio
async def test_read_wiki_cache_dict_reuses_in_memory_json(tmp_path, monkeypatch):
    monkeypatch.setattr(wiki_io, "WIKI_CACHE_DIR", str(tmp_path))
    wiki_io.clear_wiki_json_cache()
    cache = WikiCacheData(
        wiki_structure=WikiStructureModel(
            id="w", title="T", description="D", pages=[]
        ),
        generated_pages={
            "p1": WikiPage(
                id="p1",
                title="P1",
                content="hello",
                filePaths=[],
                importance="high",
                relatedPages=[],
            )
        },
        repo=RepoInfo(
            owner="local",
            repo="demo",
            type="local",
            localPath="D:/demo",
        ),
    )
    path = tmp_path / "deepwiki_cache_local_local_demo_zh.json"
    path.write_text(cache.model_dump_json(), encoding="utf-8")

    first = await wiki_io.read_wiki_cache_dict("local", "demo", "local", "zh")
    second = await wiki_io.read_wiki_cache_dict("local", "demo", "local", "zh")
    assert first is second
    assert first["generated_pages"]["p1"]["content"] == "hello"

    page = await wiki_io.read_wiki_page("local", "demo", "local", "zh", "p1")
    assert page is not None
    assert page["content"] == "hello"
