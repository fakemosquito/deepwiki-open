from datetime import datetime

from fastapi.testclient import TestClient

from api.schemas import WikiPage
from api.services.wiki import export_wiki
from api.services.wiki.html_export import generate_html_export


def _page(**overrides) -> WikiPage:
    data = dict(
        id="page-1",
        title="架构概览",
        content="# Hello\n\n```mermaid\ngraph TD\n  A-->B\n```\n",
        filePaths=["src/main.ts"],
        importance="high",
        relatedPages=["page-2"],
    )
    data.update(overrides)
    return WikiPage(**data)


def test_html_export_embeds_pages_and_mermaid():
    html = generate_html_export(
        "C:\\\\Users\\\\demo\\\\fakereel_player",
        [
            _page(),
            WikiPage(
                id="page-2",
                title="IPC",
                content="related",
                filePaths=[],
                importance="medium",
                relatedPages=[],
            ),
        ],
        timestamp=datetime(2026, 8, 24, 12, 0, 0),
    )

    assert html.strip().startswith("<!DOCTYPE html>")
    assert "wiki-data" in html
    assert "架构概览" in html
    assert "graph TD" in html
    assert "mermaidApi.render" in html
    assert "preprocessMermaid" in html
    assert "cdn.jsdelivr.net" not in html
    assert len(html) > 1_000_000


def test_html_export_escapes_script_tags_in_content():
    html = generate_html_export(
        "https://github.com/acme/demo",
        [_page(content="alert</script><script>alert(1)</script>")],
        timestamp=datetime(2026, 8, 24, 12, 0, 0),
    )

    # The payload must not be able to close the host script tag.
    assert "</script><script>alert(1)</script>" not in html
    assert "\\u003c/script\\u003e" in html


def test_export_wiki_html_format_dispatches():
    html = export_wiki(
        "https://github.com/acme/demo",
        [_page()],
        format="html",
        timestamp=datetime(2026, 8, 24, 12, 0, 0),
    )
    assert "<!DOCTYPE html>" in html
    assert "acme/demo" in html


def test_export_wiki_html_endpoint_downloads_file():
    from api.main import app

    with TestClient(app) as client:
        response = client.post(
            "/export/wiki",
            json={
                "repo_url": r"C:\Users\demo\fakereel_player",
                "format": "html",
                "pages": [_page().model_dump()],
            },
        )

    assert response.status_code == 200, response.text
    assert "text/html" in response.headers["content-type"]
    assert "fakereel_player_wiki_" in response.headers["content-disposition"]
    assert response.headers["content-disposition"].endswith(".html")
    assert response.text.strip().startswith("<!DOCTYPE html>")
