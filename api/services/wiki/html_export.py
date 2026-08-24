"""Standalone interactive HTML export for wiki pages.

The generated file is self-contained: Markdown and Mermaid libraries are inlined
from local vendor / node_modules copies so the page works without a network.
"""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path

from api.logger import get_logger
from api.schemas import WikiPage

logger = get_logger(__name__)

_HERE = Path(__file__).resolve().parent
_TEMPLATE_PATH = _HERE / "html_export_template.html"
_VENDOR_DIR = _HERE / "vendor"
_PLACEHOLDER_DATA = "__WIKI_DATA__"
_PLACEHOLDER_SCRIPTS = "__VENDOR_SCRIPTS__"


def _walk_node_modules(*parts: str) -> Path | None:
    for parent in (_HERE, *_HERE.parents):
        candidate = parent / "node_modules" / Path(*parts)
        if candidate.is_file():
            return candidate
    return None


def _resolve_js(vendor_name: str, *node_modules_parts: str) -> Path | None:
    vendor_path = _VENDOR_DIR / vendor_name
    if vendor_path.is_file():
        return vendor_path
    return _walk_node_modules(*node_modules_parts)


def _inline_script(js: str) -> str:
    safe = js.replace("</", "<\\/")
    return "<script>" + safe + "</script>\n"


def _vendor_scripts() -> str:
    chunks: list[str] = []
    marked = _resolve_js("marked.umd.js", "marked", "lib", "marked.umd.js")
    mermaid = _resolve_js(
        "mermaid.min.js", "mermaid", "dist", "mermaid.min.js"
    )
    if marked:
        chunks.append(_inline_script(marked.read_text(encoding="utf-8")))
    else:
        logger.warning("marked.umd.js not found; exported wiki will use the built-in Markdown renderer")
    if mermaid:
        chunks.append(_inline_script(mermaid.read_text(encoding="utf-8")))
    else:
        logger.warning(
            "mermaid.min.js not found; exported wiki will show diagram source instead of rendered charts"
        )
    return "".join(chunks)


def generate_html_export(
    repo_url: str, pages: list[WikiPage], timestamp: datetime
) -> str:
    """Render a single-file interactive wiki page that works offline."""
    payload = {
        "metadata": {
            "repository": repo_url,
            "generated_at": timestamp.isoformat(),
            "page_count": len(pages),
        },
        "pages": [page.model_dump() for page in pages],
    }
    wiki_json = json.dumps(payload, ensure_ascii=False)
    # Prevent </script> in page content from breaking the host HTML document.
    wiki_json = (
        wiki_json.replace("<", "\\u003c")
        .replace(">", "\\u003e")
        .replace("&", "\\u0026")
    )
    template = _TEMPLATE_PATH.read_text(encoding="utf-8")
    if _PLACEHOLDER_DATA not in template or _PLACEHOLDER_SCRIPTS not in template:
        raise RuntimeError("HTML export template is missing required placeholders")
    return template.replace(_PLACEHOLDER_SCRIPTS, _vendor_scripts(), 1).replace(
        _PLACEHOLDER_DATA, wiki_json, 1
    )
