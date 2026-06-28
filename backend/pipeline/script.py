"""Script generation stage.

Calls the DeepSeek API to generate a structured video script JSON based
on the research summary, user-provided parameters, and a narrative template.

Templates constrain the story structure (beats, timing, tone) so generated
scripts follow proven patterns (Nerdologia, Hook+3Points, Problem→Solution).
"""

from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime

import httpx

from backend.config import settings
from backend.pipeline.narrative_templates import (
    Beat,
    NarrativeTemplate,
    TemplateDefinition,
    build_prompt_context,
    get_template,
)
from backend.pipeline.research import ResearchResult

logger = logging.getLogger(__name__)

DEEPSEEK_API_URL = "https://api.deepseek.com/v1/chat/completions"
DEEPSEEK_MODEL = "deepseek-chat"

SYSTEM_PROMPT_BASE = """You are a professional video scriptwriter for short-form vertical video (9:16).
Generate a video script as valid JSON following the EXACT template structure provided.
RETURN ONLY JSON, no markdown, no explanation.

FORMAT:
{
  "script_id": "scr_YYYYMMDD_XXXXX",
  "title": "catchy title, max 60 chars, in Brazilian Portuguese",
  "seo_keywords": ["kw1", "kw2", "kw3"],
  "scenes": [
    {
      "scene_id": 1,
      "dialogue": "spoken narration for this beat, in Brazilian Portuguese",
      "visual_prompt": "English description for image search matching this beat",
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
    template_id: str = NarrativeTemplate.HOOK_3POINTS_CTA,
) -> dict:
    """Generate a video script via the DeepSeek API.

    Uses the specified narrative template to constrain structure,
    timing, and tone.

    Returns the parsed JSON script as a Python dict.
    """
    try:
        template = get_template(template_id)
    except ValueError:
        logger.warning(
            "Unknown template '%s' — falling back to hook_3points_cta",
            template_id,
        )
        template = get_template(NarrativeTemplate.HOOK_3POINTS_CTA)

    logger.info(
        "Script stage: topic='%s', duration=%ds, template=%s, platform=%s",
        topic, duration, template_id, platform,
    )

    template_context = build_prompt_context(template)
    system_prompt = SYSTEM_PROMPT_BASE + "\n\n" + template_context
    user_prompt = _build_user_prompt(topic, research, duration, platform, style)

    api_key = settings.deepseek_api_key
    if not api_key:
        logger.warning("DEEPSEEK_API_KEY not set — generating stub script")
        return _generate_stub_script(topic, template)

    payload = {
        "model": DEEPSEEK_MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
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


def _generate_stub_script(topic: str, template: TemplateDefinition) -> dict:
    """Generate a stub script following the template structure.

    Used when the DeepSeek API key is unavailable.
    Still respects beat structure and timing from the template.
    """
    scenes = []
    dialogue_templates = {
        "hook": f"Você sabia disso sobre {topic}?",
        "question_hook": f"Como funciona {topic}? A resposta vai te surpreender.",
        "problem_hook": f"O maior erro com {topic} que quase todo mundo comete.",
        "context": f"{topic} está em todo lugar — mas pouca gente entende de verdade.",
        "quick_context": f"Parece simples, mas {topic} tem camadas que ninguém te conta.",
        "agitation": "E o pior: sem entender isso, você toma decisão errada.",
        "solution_intro": "É aí que a solução certa muda tudo.",
        "point_1": f"Primeiro: {topic} não é o que parece à primeira vista.",
        "point_2": f"Segundo: o que realmente importa em {topic} é a estrutura por trás.",
        "point_3": f"Terceiro: o insight que conecta tudo sobre {topic}.",
        "layer_1": f"{topic} começa com um princípio simples que quase todo mundo ignora.",
        "layer_2": f"Mas a segunda camada de {topic} revela algo que contradiz o senso comum.",
        "layer_3": f"E a camada mais profunda de {topic} muda completamente como você vê o assunto.",
        "feature_1": f"Com a ferramenta certa, você resolve {topic} em segundos.",
        "feature_2": "E o melhor: sem curva de aprendizado.",
        "conclusion": f"Agora você sabe o essencial sobre {topic}. Use esse conhecimento.",
        "payoff": f"E é por isso que {topic} é muito mais interessante do que parece.",
        "result": "O resultado fala por si: menos tempo, mais resultado.",
        "cta": "Segue pra mais conteúdos como esse!",
        "signature_cta": "Curte e compartilha pra mais curiosidades como essa.",
    }

    for beat in template.beats:
        dialogue = dialogue_templates.get(beat.id, f"Vamos falar sobre {topic}.")
        visual_prompt = _beat_visual_prompt(beat, topic)
        scenes.append({
            "scene_id": beat.id if isinstance(beat.id, int) else len(scenes) + 1,
            "dialogue": dialogue,
            "visual_prompt": visual_prompt,
            "duration_s": beat.duration_s,
        })

    today = datetime.utcnow().strftime("%Y%m%d")
    short_id = uuid.uuid4().hex[:8]

    script = {
        "script_id": f"scr_{today}_{short_id}",
        "title": topic[:60],
        "seo_keywords": [topic.lower().replace(" ", "_")],
        "scenes": scenes,
        "audio": {"background_music_tag": "upbeat_light"},
        "editing": {
            "cta_text": "Follow for more!",
            "cta_overlay_at_s": sum(b.duration_s for b in template.beats[:-1]),
        },
    }

    logger.info("Stub script generated: %d scenes (template=%s)", len(scenes), template.id)
    return script


def _beat_visual_prompt(beat: Beat, topic: str) -> str:
    """Generate an English visual prompt for a beat."""

    visual_map = {
        "hook": f"dramatic attention-grabbing image about {topic}, high contrast",
        "question_hook": f"intriguing visual question mark or mystery concept art about {topic}",
        "problem_hook": f"frustrating situation related to {topic}, dramatic lighting",
        "context": f"explainer context visual for {topic}, clean professional stock photo",
        "quick_context": f"fast context setting image about {topic}, editorial style",
        "agitation": f"stressful consequence of not understanding {topic}",
        "solution_intro": f"clean modern solution concept for {topic}",
        "point_1": f"educational diagram explaining first aspect of {topic}",
        "point_2": f"detailed infographic about {topic} second layer",
        "point_3": f"mind-blowing visualization of {topic} deepest insight",
        "layer_1": f"scientific illustration showing basic principle of {topic}",
        "layer_2": f"comparison diagram showing hidden complexity of {topic}",
        "layer_3": f"stunning reveal or aha-moment visualization for {topic}",
        "feature_1": f"clean product screenshot showing {topic} solution",
        "feature_2": f"before-after comparison for {topic}",
        "conclusion": f"summary wrap-up visual for {topic}, satisfying closure",
        "payoff": f"impactful closing statement visual about {topic}, memorable",
        "result": f"successful outcome after solving {topic}, happy result",
        "cta": "follow for more, like and subscribe, engaging call to action",
        "signature_cta": "nerdologia style sign-off, educational channel branding",
    }
    return visual_map.get(beat.id, f"{topic} visual illustration")

