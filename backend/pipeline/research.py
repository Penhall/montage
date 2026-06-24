"""Web research stage.

Uses DuckDuckGo (via the ``duckduckgo_search`` library) to research the
topic and extract key points. Falls back to a simple summary if no
external search library is installed.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)


@dataclass
class ResearchResult:
    """Result of the research stage."""

    topic: str
    key_points: list[str] = field(default_factory=list)
    sources: list[str] = field(default_factory=list)
    summary: str = ""


async def run_research(topic: str, max_results: int = 5) -> ResearchResult:
    """Research *topic* and return key points.

    Tries to use ``duckduckgo_search`` if installed; otherwise falls
    back to a stub response so the pipeline can still run for testing.
    """
    logger.info("Research stage: topic='%s'", topic)

    try:
        return await _research_duckduckgo(topic, max_results)
    except ImportError:
        logger.warning("duckduckgo_search not installed — using stub research")
        return _research_stub(topic)
    except Exception as exc:
        logger.error("Research failed with error: %s", exc)
        logger.warning("Falling back to stub research")
        return _research_stub(topic)


async def _research_duckduckgo(topic: str, max_results: int) -> ResearchResult:
    """Perform research using DuckDuckGo."""
    # Lazy import so the package isn't required at install time
    from duckduckgo_search import DDGS  # type: ignore[import-untyped]

    key_points: list[str] = []
    sources: list[str] = []

    async def _search() -> None:
        with DDGS() as ddgs:
            for i, result in enumerate(ddgs.text(topic, max_results=max_results)):
                if i >= max_results:
                    break
                title = result.get("title", "")
                body = result.get("body", "")
                url = result.get("href", "")
                if body:
                    key_points.append(body.strip())
                if url:
                    sources.append(url)
                logger.debug("  [%d] %s — %s", i + 1, title, url)

    try:
        await _search()
    except Exception:
        # DDGS may not support async; fall back to sync
        with DDGS() as ddgs:
            for i, result in enumerate(ddgs.text(topic, max_results=max_results)):
                if i >= max_results:
                    break
                body = result.get("body", "")
                url = result.get("href", "")
                if body:
                    key_points.append(body.strip())
                if url:
                    sources.append(url)

    summary = _build_summary(topic, key_points)

    logger.info(
        "Research complete: %d key points, %d sources",
        len(key_points),
        len(sources),
    )
    return ResearchResult(
        topic=topic,
        key_points=key_points,
        sources=sources,
        summary=summary,
    )


def _research_stub(topic: str) -> ResearchResult:
    """Return a stub research result for testing."""
    key_points = [
        f"{topic} is a trending topic with growing interest.",
        f"Industry experts recommend exploring {topic} for creative video content.",
        f"Viewers engage strongly with content about {topic} on short-form platforms.",
    ]
    summary = _build_summary(topic, key_points)
    return ResearchResult(
        topic=topic,
        key_points=key_points,
        sources=[],
        summary=summary,
    )


def _build_summary(topic: str, key_points: list[str]) -> str:
    """Build a concise summary from key points."""
    if not key_points:
        return f"Research on '{topic}' yielded no specific results."

    intro = f"Research summary for '{topic}':\n"
    bullets = "\n".join(f"- {p}" for p in key_points[:6])
    return intro + bullets
