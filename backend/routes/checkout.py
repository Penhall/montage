"""Stripe checkout endpoints (stub for MVP).

These endpoints are placeholders that return mock data. They will be
replaced with real Stripe API calls in a future iteration.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Request

from backend.config import settings

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/api/checkout/create-session", tags=["Billing"])
async def create_checkout_session(request: Request):
    """Create a Stripe Checkout Session (stub).

    Returns a mock session URL. Replace with real Stripe SDK call when
    ready for production billing.
    """
    user_id: str = request.state.user_id
    logger.info("Checkout session requested for user %s (stub)", user_id)

    # Stub: return a placeholder
    return {
        "session_id": "cs_test_stub_" + user_id[-8:],
        "url": "https://checkout.stripe.com/pay/cs_test_stub",
        "stub": True,
    }


@router.post("/api/webhook/stripe", tags=["Billing"])
async def stripe_webhook(request: Request):
    """Stripe webhook endpoint (stub).

    Accepts raw body; echoes back a simple acknowledgment.
    Replace with real stripe.Webhook.construct_event() when ready.
    """
    body = await request.body()
    sig = request.headers.get("stripe-signature", "")
    logger.info("Stripe webhook received (stub): sig=%s, body_len=%d", sig[:16] + "...", len(body))
    return {"status": "received", "stub": True}
