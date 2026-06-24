"""Script generation stage.

Calls the DeepSeek API to generate a structured video script JSON based
on the research summary and user-provided parameters.
"""

from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime

import httpx

from backend.config import settings
from backend.pipeline.research import ResearchResult

logger = logging.getLogger(__name__)

DEEPSEEK_API_URL = "https://api.deepseek.com/v1/chat/completions"
DEEPSEEK_MODEL = "deepseek-chat"

SYSTEM_PROMPT = """You are a professional video scriptwriter. Generate a video script as valid JSON.
Video duration: 30-90 seconds. Platform: TikTok/Instagram Reels/YouTube Shorts (vertical 9:16).
RETURN ONLY JSON, no markdown, no explanation.

FORMAT:
{
  "script_id": "scr_YYYYMMDD_XXXXX",
  "title": "catchy title, max 60 chars",
  "seo_keywords": ["kw1", "kw2", "kw3"],
  "scenes": [
    {
      "scene_id": 1,
      "dialogue": "hook — grab attention in first 3 seconds",
      "visual_prompt": "description for image search in English",
      "duration_s": 4
    }
  ],
  "audio": {"background_music_tag": "upbeat_light"},
  "editing": {"cta_text": "Follow for more!", "cta_overlay_at_s": 55}
}
"""


async def generate_script(
    topic: str,
    research: ResearchResult,
    *,
    duration: int = 45,
    platform: str = "tiktok_9_16",
    style: str = "clean_professional",
) -> dict:
    """Generate a video script via the DeepSeek API.

    Returns the parsed JSON script as a Python dict.
    """
    logger.info("Script stage: topic='%s', duration=%ds, platform=%s", topic, duration, platform)

    user_prompt = _build_user_prompt(topic, research, duration, platform, style)

    api_key = settings.deepseek_api_key
    if not api_key:
        logger.warning("DEEPSEEK_API_KEY not set — generating stub script")
        return _generate_stub_script(topic, duration)

    payload = {
        "model": DEEPSEEK_MODEL,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": 0.7,
        "max_tokens": 4096,
    }

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    async with httpx.AsyncClient(timeout=60.0) as client:
        try:
            resp = await client.post(DEEPSEEK_API_URL, json=payload, headers=headers)
            resp.raise_for_status()
            data = resp.json()
        except httpx.HTTPStatusError as exc:
            logger.error("DeepSeek API HTTP error: %s — %s", exc.response.status_code, exc.response.text)
            raise
        except httpx.RequestError as exc:
            logger.error("DeepSeek API request failed: %s", exc)
            raise

    content = data["choices"][0]["message"]["content"]
    cleaned = content.strip()
    if cleaned.startswith("```"):
        # Strip markdown fences
        cleaned = cleaned.removeprefix("```json").removeprefix("```").removesuffix("```").strip()

    try:
        script = json.loads(cleaned)
    except json.JSONDecodeError as exc:
        logger.error("Failed to parse DeepSeek response as JSON: %s", exc)
        logger.debug("Raw response: %s", content[:500])
        raise

    # Ensure script_id is set
    if "script_id" not in script:
        today = datetime.utcnow().strftime("%Y%m%d")
        short_id = uuid.uuid4().hex[:8]
        script["script_id"] = f"scr_{today}_{short_id}"

    scene_count = len(script.get("scenes", []))
    logger.info("Script generated: %d scenes, title='%s'", scene_count, script.get("title", ""))

    return script


def _build_user_prompt(
    topic: str,
    research: ResearchResult,
    duration: int,
    platform: str,
    style: str,
) -> str:
    """Build the user message for the LLM."""
    lines = [
        f"Topic: {topic}",
        f"Target duration: {duration} seconds",
        f"Platform/format: {platform}",
        f"Style: {style}",
        "",
        "Research findings:",
        research.summary,
        "",
        "Please generate a video script in the specified JSON format.",
    ]
    return "\n".join(lines)


def _generate_stub_script(topic: str, duration: int) -> dict:
    """Generate a stub script when the DeepSeek API key is unavailable."""
    scene_count = max(3, duration // 8)
    scenes = []
    per_scene = max(4, duration // scene_count)

    dialogues = [
        f"Did you know this about {topic}? Let me explain.",
        f"Here's what you need to understand about {topic}.",
        f"This is how {topic} works in practice.",
        f"Let me show you a real example of {topic}.",
        f"Here's the key insight about {topic}.",
    ]

    for i in range(scene_count):
        dialogue = dialogues[i % len(dialogues)]
        scenes.append({
            "scene_id": i + 1,
            "dialogue": dialogue,
            "visual_prompt": f"{topic} visual — {['concept art', 'real footage', 'animation', 'diagram', 'example'][i % 5]}",
            "duration_s": per_scene,
        })

    today = datetime.utcnow().strftime("%Y%m%d")
    short_id = uuid.uuid4().hex[:8]

    script = {
        "script_id": f"scr_{today}_{short_id}",
        "title": topic[:60],
        "seo_keywords": [topic.lower().replace(" ", "_")],
        "scenes": scenes,
        "audio": {"background_music_tag": "upbeat_light"},
        "editing": {"cta_text": "Follow for more!", "cta_overlay_at_s": max(10, duration - 15)},
    }

    logger.info("Stub script generated: %d scenes", scene_count)
    return script
