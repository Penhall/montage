"""Narrative templates for video script generation.

Each template defines the story structure, timing per beat,
visual direction, and tone. Injected into the LLM prompt to
constrain creative output to proven patterns.

Reference: Nerdologia (YouTube) — fast-paced educational explainers
with hook question, curated visuals, and authoritative yet accessible tone.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import StrEnum


class NarrativeTemplate(StrEnum):
    """Available narrative templates."""
    HOOK_3POINTS_CTA = "hook_3points_cta"
    PROBLEM_SOLUTION = "problem_solution"
    NERDOLOGIA = "nerdologia"


@dataclass
class Beat:
    """One structural beat in the narrative."""
    id: str
    label: str
    duration_s: int
    description: str


@dataclass
class TemplateDefinition:
    """Full template definition — structure, timing, visual, tone."""
    id: str
    name: str
    description: str
    beats: list[Beat]
    tone: str
    visual_style: str
    image_style: str
    pacing_label: str  # "fast" (<6s/b), "medium" (6-9s/b), "slow" (>9s/b)
    total_duration_s: int = 0

    def __post_init__(self) -> None:
        self.total_duration_s = sum(b.duration_s for b in self.beats)


# ── Template Definitions ──────────────────────────────────────────────

TEMPLATES: dict[str, TemplateDefinition] = {
    NarrativeTemplate.HOOK_3POINTS_CTA: TemplateDefinition(
        id="hook_3points_cta",
        name="Hook + 3 Pontos + CTA",
        description="Universal explainer: gancho forte → 3 pontos → call-to-action. Funciona para 80% dos vídeos curtos.",
        beats=[
            Beat("hook", "Hook", 3, "Gancho forte em até 3s. Pode ser pergunta, afirmação chocante, ou estatística surpreendente."),
            Beat("context", "Contexto", 5, "Contexto rápido: por que isso importa agora. 1-2 frases."),
            Beat("point_1", "Ponto 1", 8, "Primeiro insight — o mais acessível. Base do conceito."),
            Beat("point_2", "Ponto 2", 8, "Segundo insight — camada intermediária. Constrói sobre o ponto 1."),
            Beat("point_3", "Ponto 3", 8, "Terceiro insight — o mais profundo/surpreendente. Payoff intelectual."),
            Beat("conclusion", "Conclusão", 5, "Resumo de 1 frase. Conecta os 3 pontos. Deixa o espectador com uma ideia clara."),
            Beat("cta", "CTA", 3, "Call-to-action: like, follow, link na bio, comentar."),
        ],
        tone="educativo com energia — tom de quem sabe do que está falando, mas não é pedante",
        visual_style="clean_professional",
        image_style="imagens de alta qualidade, bem iluminadas, composição limpa. Sem excesso de elementos.",
        pacing_label="medium",
    ),

    NarrativeTemplate.PROBLEM_SOLUTION: TemplateDefinition(
        id="problem_solution",
        name="Problema → Solução",
        description="Product demo / SaaS: dor do usuário → produto como solução → features → resultado.",
        beats=[
            Beat("problem_hook", "Problema", 4, "Dor real que o espectador sente. Frase curta e direta."),
            Beat("agitation", "Agravamento", 4, "Por que isso é pior do que parece. Consequência."),
            Beat("solution_intro", "Solução", 3, "Apresenta o produto/ferramenta como resposta."),
            Beat("feature_1", "Feature 1", 8, "Primeira funcionalidade-chave. Como resolve o problema."),
            Beat("feature_2", "Feature 2", 8, "Segunda funcionalidade. Diferencial competitivo."),
            Beat("result", "Resultado", 8, "Antes/depois, métrica, depoimento. Prova visual."),
            Beat("cta", "CTA", 5, "Trial, demo, link na bio. Urgência suave."),
        ],
        tone="direto e persuasivo — foco no resultado, não no produto. O espectador é o herói.",
        visual_style="bold_contrast",
        image_style="antes/depois, screenshots limpos, close-ups de produto. Alto contraste.",
        pacing_label="medium",
    ),

    NarrativeTemplate.NERDOLOGIA: TemplateDefinition(
        id="nerdologia",
        name="Nerdologia",
        description="Estilo Nerdologia: pergunta provocativa → mergulho progressivo → payoff intelectual. Ritmo rápido, tom de autoridade acessível.",
        beats=[
            Beat("question_hook", "Pergunta", 4, "Pergunta intrigante no estilo Nerdologia: 'Você sabia que...?', 'Como funciona...?', 'Por que...?' — algo que gere curiosidade imediata."),
            Beat("quick_context", "Contexto", 4, "Contexto ultra-rápido: 1-2 frases situando o tema. Pode incluir uma referência pop ou histórica."),
            Beat("layer_1", "Camada 1", 7, "Primeira camada de explicação — o básico que todo mundo deveria saber. Tom didático mas não infantil."),
            Beat("layer_2", "Camada 2", 7, "Segunda camada — 'mas não é só isso'. Adiciona nuance, contraponto, ou fato curioso."),
            Beat("layer_3", "Camada 3", 8, "Terceira camada — o insight mais profundo. A revelação que faz o espectador pensar 'nossa, não sabia disso'."),
            Beat("payoff", "Payoff", 5, "Frase de conclusão impactante. Conecta as 3 camadas numa ideia só. Estilo: 'E é por isso que...'"),
            Beat("signature_cta", "Assinatura", 3, "CTA com identidade: logo + frase curta. Nerdologia usa 'Curte e compartilha pra mais curiosidades como essa'."),
        ],
        tone="autoridade acadêmica acessível — como um professor que sabe muito mas explica de forma leve. Nerd, não arrogante.",
        visual_style="nerdologia_dark",
        image_style="ilustrações científicas, gráficos, diagramas, fotos de arquivo com curadoria alta. Fundo escuro. Consistência visual entre cenas.",
        pacing_label="fast",
    ),
}


def get_template(template_id: str) -> TemplateDefinition:
    """Get a template definition by ID.

    Raises ValueError if not found.
    """
    if template_id not in TEMPLATES:
        available = ", ".join(TEMPLATES.keys())
        raise ValueError(
            f"Unknown template '{template_id}'. Available: {available}"
        )
    return TEMPLATES[template_id]


def build_prompt_context(template: TemplateDefinition) -> str:
    """Build the prompt injection block for a given template.

    Returns a string to be appended to the LLM system prompt.
    """
    beats_text = "\n".join(
        f"  {i+1}. [{b.id}] ({b.duration_s}s) {b.label}: {b.description}"
        for i, b in enumerate(template.beats)
    )

    return f"""
NARRATIVE TEMPLATE: {template.name}
============================================================
Description: {template.description}
Total target duration: {template.total_duration_s}s
Tone: {template.tone}
Pacing: {template.pacing_label}

STRUCTURE — EXACT beats (do NOT deviate):
{beats_text}

RULES:
- Generate EXACTLY {len(template.beats)} scenes, one per beat.
- Each scene's duration_s MUST match the beat duration_s above.
- scene_id must be sequential starting from 1.
- The dialogue field is the spoken narration for that beat.
- visual_prompt is an English description for image search that matches the beat's intent and visual style.
- Visual style: {template.visual_style}. Image style: {template.image_style}.
- The title must be catchy, max 60 chars, in Brazilian Portuguese.
- seo_keywords: 3-5 relevant keywords in Portuguese.
""".strip()
