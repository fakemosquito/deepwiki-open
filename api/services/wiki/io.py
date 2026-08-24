import asyncio
import json
import os
from collections import OrderedDict
from datetime import datetime
from typing import Any, Literal

from api.logger import get_logger
from api.schemas import (
    TaskStatus,
    ProcessedProjectEntry,
    WikiCacheData,
    WikiTaskSummary,
    WikiPage,
    asave,
)
from api.services.wiki.html_export import generate_html_export
from api.utils import deepwiki_root

logger = get_logger(__name__)

WIKI_CACHE_DIR = os.path.join(deepwiki_root(), "wikicache")
os.makedirs(WIKI_CACHE_DIR, exist_ok=True)
WIKI_PREFIX = "deepwiki_cache_"

# Parsed wiki JSON keyed by absolute path. Listing a local project and then
# opening it used to deserialize the same multi-megabyte file twice.
_JSON_CACHE: OrderedDict[str, tuple[float, dict[str, Any]]] = OrderedDict()
_JSON_CACHE_MAX = 4


def get_wiki_cache_path(owner: str, repo: str, repo_type: str, language: str) -> str:
    """Generates the file path for a given wiki cache."""
    filename = f"{WIKI_PREFIX}{repo_type}_{owner}_{repo}_{language}.json"
    return os.path.join(WIKI_CACHE_DIR, filename)


def wiki_cache_exists(owner: str, repo: str, repo_type: str, language: str) -> bool:
    return os.path.exists(
        get_wiki_cache_path(owner, repo=repo, repo_type=repo_type, language=language)
    )


def clear_wiki_json_cache() -> None:
    """Drop in-memory wiki JSON. Used by tests and after cache file changes."""
    _JSON_CACHE.clear()


def _invalidate_wiki_json_cache(cache_path: str) -> None:
    _JSON_CACHE.pop(cache_path, None)


def _load_wiki_json_sync(cache_path: str) -> dict[str, Any] | None:
    if not os.path.exists(cache_path):
        _invalidate_wiki_json_cache(cache_path)
        return None
    mtime = os.path.getmtime(cache_path)
    cached = _JSON_CACHE.get(cache_path)
    if cached and cached[0] == mtime:
        _JSON_CACHE.move_to_end(cache_path)
        return cached[1]
    with open(cache_path, encoding="utf-8") as file:
        data = json.load(file)
    if not isinstance(data, dict):
        raise ValueError(f"Wiki cache is not a JSON object: {cache_path}")
    _JSON_CACHE[cache_path] = (mtime, data)
    _JSON_CACHE.move_to_end(cache_path)
    while len(_JSON_CACHE) > _JSON_CACHE_MAX:
        _JSON_CACHE.popitem(last=False)
    return data


def _page_without_content(page: Any) -> Any:
    if not isinstance(page, dict):
        return page
    slim = dict(page)
    slim["content"] = ""
    return slim


def _local_repo_url_from_dict(data: dict[str, Any] | None) -> str | None:
    if not data:
        return None
    repo = data.get("repo")
    if isinstance(repo, dict):
        return repo.get("localPath") or repo.get("repoUrl")
    repo_url = data.get("repo_url")
    return repo_url if isinstance(repo_url, str) else None


def preview_wiki_cache(
    data: dict[str, Any], page_id: str | None = None
) -> dict[str, Any]:
    """Keep directory metadata plus one page body; strip every other page.

    Opening a cached wiki previously shipped the entire generated_pages map
    (often many megabytes of markdown) to the browser in one response.
    """
    structure = dict(data.get("wiki_structure") or {})
    structure_pages = structure.get("pages") or []
    if not isinstance(structure_pages, list):
        structure_pages = []
    structure["pages"] = [_page_without_content(page) for page in structure_pages]

    generated = data.get("generated_pages") or {}
    if not isinstance(generated, dict):
        generated = {}

    keep_id = page_id
    if not keep_id and structure_pages:
        first = structure_pages[0]
        if isinstance(first, dict) and first.get("id") in generated:
            keep_id = first["id"]
    if not keep_id and generated:
        keep_id = next(iter(generated))

    slim_generated = {
        pid: (page if pid == keep_id else _page_without_content(page))
        for pid, page in generated.items()
    }
    preview = dict(data)
    preview["wiki_structure"] = structure
    preview["generated_pages"] = slim_generated
    return preview


async def read_wiki_cache_dict(
    owner: str, repo: str, repo_type: str, language: str
) -> dict[str, Any] | None:
    """Load wiki cache JSON without Pydantic validation."""
    cache_path = get_wiki_cache_path(owner, repo, repo_type, language)
    try:
        return await asyncio.to_thread(_load_wiki_json_sync, cache_path)
    except Exception:
        logger.exception("Error reading wiki cache from %s", cache_path)
        return None


async def read_wiki_page(
    owner: str, repo: str, repo_type: str, language: str, page_id: str
) -> dict[str, Any] | None:
    data = await read_wiki_cache_dict(owner, repo, repo_type, language)
    if not data:
        return None
    generated = data.get("generated_pages") or {}
    page = generated.get(page_id) if isinstance(generated, dict) else None
    return page if isinstance(page, dict) else None


async def read_wiki_cache(
    owner: str, repo: str, repo_type: str, language: str
) -> WikiCacheData | None:
    """Reads wiki cache data from the file system."""
    data = await read_wiki_cache_dict(owner, repo, repo_type, language)
    if data is None:
        return None
    try:
        return await asyncio.to_thread(WikiCacheData.model_validate, data)
    except Exception:
        logger.exception(
            "Error validating wiki cache for %s/%s (%s)", owner, repo, repo_type
        )
        return None


async def save_wiki_cache(
    owner: str, repo: str, repo_type: str, language: str, wiki_cache: WikiCacheData
) -> bool:
    """Saves wiki cache data to the file system."""
    cache_path = get_wiki_cache_path(
        owner=owner,
        repo=repo,
        repo_type=repo_type,
        language=language,
    )
    logger.info(f"Attempting to save wiki cache. Path: {cache_path}")
    try:
        await asave(wiki_cache, cache_path, encoding="utf-8")
        _invalidate_wiki_json_cache(cache_path)
        logger.info(f"Wiki cache successfully saved to {cache_path}")
        return True
    except OSError:
        logger.exception("IOError saving wiki cache to %s", cache_path)
        return False
    except Exception:
        logger.exception("Unexpected error saving wiki cache to %s", cache_path)
        return False


async def delete_wiki_cache(owner: str, repo: str, repo_type: str, language: str):
    cache_path = get_wiki_cache_path(
        owner,
        repo,
        repo_type,
        language,
    )

    if not os.path.exists(cache_path):
        logger.warning("Wiki cache not found, cannot delete: %s", cache_path)
        return False

    _invalidate_wiki_json_cache(cache_path)
    os.remove(cache_path)
    logger.info("Successfully deleted wiki cache: %s", cache_path)
    return True


async def list_wiki_cache() -> list[WikiTaskSummary]:
    if not os.path.exists(WIKI_CACHE_DIR):
        logger.info(
            f"Cache directory {WIKI_CACHE_DIR} not found. Returning empty list."
        )
        return []

    logger.info(f"Scanning for project cache files in: {WIKI_CACHE_DIR}")
    entries = []
    for filename in await asyncio.to_thread(os.listdir, WIKI_CACHE_DIR):
        if not (filename.startswith(WIKI_PREFIX) and filename.endswith(".json")):
            continue
        file_path = os.path.join(WIKI_CACHE_DIR, filename)
        try:
            stats = await asyncio.to_thread(os.stat, file_path)
            repo_type, owner, *repo, language = (
                os.path.splitext(filename)[0].removeprefix(WIKI_PREFIX).split("_")
            )
            repo_url = None
            if repo_type == "local":
                try:
                    cache = await asyncio.to_thread(_load_wiki_json_sync, file_path)
                    repo_url = _local_repo_url_from_dict(cache)
                except Exception:
                    logger.exception(
                        "Could not restore local path from wiki cache %s", file_path
                    )
            entries.append(
                WikiTaskSummary(
                    id=filename,
                    owner=owner,
                    repo="_".join(repo),
                    repo_type=repo_type,
                    language=language,
                    submitted_at=int(stats.st_mtime * 1000),
                    status=TaskStatus.COMPLETED,
                    repo_url=repo_url,
                )
            )
        except Exception:
            logger.exception("Error processing file %s", file_path, exc_info=True)

    logger.info("Found %d processed project entries.", len(entries))
    return entries


async def list_processed_projects() -> list[ProcessedProjectEntry]:
    project_entries: list[ProcessedProjectEntry] = [
        ProcessedProjectEntry(
            id=wiki.id,
            owner=wiki.owner,
            repo=wiki.repo,
            name=wiki.name,
            repo_type=wiki.repo_type,
            submittedAt=wiki.submitted_at,
            language=wiki.language,
        )
        for wiki in await list_wiki_cache()
    ]

    project_entries.sort(key=lambda p: p.submittedAt, reverse=True)
    return project_entries


def _generate_json_export(
    repo_url: str, pages: list[WikiPage], timestamp: datetime
) -> str:
    """
    Generate JSON export of wiki pages.

    Args:
        repo_url: The repository URL
        pages: List of wiki pages

    Returns:
        JSON content as string
    """
    # Create a dictionary with metadata and pages
    export_data = {
        "metadata": {
            "repository": repo_url,
            "generated_at": timestamp.isoformat(),
            "page_count": len(pages),
        },
        "pages": [page.model_dump() for page in pages],
    }

    # Convert to JSON string with pretty formatting
    return json.dumps(export_data, indent=2)


def _generate_markdown_export(
    repo_url: str, pages: list[WikiPage], timestamp: datetime
) -> str:
    """
    Generate Markdown export of wiki pages.

    Args:
        repo_url: The repository URL
        pages: List of wiki pages

    Returns:
        Markdown content as string
    """
    # Start with metadata
    markdown = f"# Wiki Documentation for {repo_url}\n\n"
    markdown += f"Generated on: {timestamp.strftime('%Y-%m-%d %H:%M:%S')}\n\n"

    # Add table of contents
    markdown += "## Table of Contents\n\n"
    for page in pages:
        markdown += f"- [{page.title}](#{page.id})\n"
    markdown += "\n"

    # Add each page
    for page in pages:
        markdown += f"<a id='{page.id}'></a>\n\n"
        markdown += f"## {page.title}\n\n"

        # Add related pages
        if page.relatedPages and len(page.relatedPages) > 0:
            markdown += "### Related Pages\n\n"
            related_titles = []
            for related_id in page.relatedPages:
                # Find the title of the related page
                related_page = next((p for p in pages if p.id == related_id), None)
                if related_page:
                    related_titles.append(f"[{related_page.title}](#{related_id})")

            if related_titles:
                markdown += "Related topics: " + ", ".join(related_titles) + "\n\n"

        # Add page content
        markdown += f"{page.content}\n\n"
        markdown += "---\n\n"

    return markdown


def export_wiki(
    repo_url: str,
    pages: list[WikiPage],
    format: Literal["json", "markdown", "html"],
    timestamp: datetime | None = None,
) -> str:
    dt = timestamp or datetime.now()
    if format == "json":
        return _generate_json_export(repo_url, pages, timestamp=dt)
    elif format == "markdown":
        return _generate_markdown_export(repo_url, pages, timestamp=dt)
    elif format == "html":
        return generate_html_export(repo_url, pages, timestamp=dt)
    else:
        raise NotImplementedError(
            f"Exporting wiki to format {format} is not supported. Must be one of 'markdown', 'json', or 'html'.",
        )
