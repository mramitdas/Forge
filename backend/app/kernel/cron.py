"""Scheduled tick for background jobs on the serverless deploy path.

On Vercel the process freezes between requests, so the in-process `run_forever`
loops cannot keep time. The platform's scheduler (Vercel Cron or any external
cron + secret) hits this endpoint instead; each call runs one outbox delivery
pass and one subscription renewal pass.
"""
from __future__ import annotations

import secrets
from typing import Annotated

from fastapi import APIRouter, Header, Request
from fastapi.responses import JSONResponse

from app.core.config import get_settings
from app.kernel.events import Dispatcher
from app.modules.membership.renewal import RenewalWorker

router = APIRouter(prefix="/system", tags=["system"])


def _secret_ok(settings, authorization: str | None, x_cron_secret: str | None) -> bool:
    expected = settings.cron_secret
    if not expected:
        return False
    if x_cron_secret and secrets.compare_digest(x_cron_secret, expected):
        return True
    if authorization:
        name, _, value = authorization.partition(" ")
        if name.lower() == "bearer":
            return secrets.compare_digest(value, expected)
    return False


@router.get("/jobs/tick")
async def jobs_tick(
    request: Request,
    authorization: Annotated[str | None, Header()] = None,
    x_cron_secret: Annotated[str | None, Header()] = None,
) -> JSONResponse:
    settings = get_settings()
    if not _secret_ok(settings, authorization, x_cron_secret):
        return JSONResponse(status_code=403, content={"detail": "forbidden"})
    outbox = await Dispatcher().run_once()
    renewals = await RenewalWorker().run_once()
    return JSONResponse(
        content={"outbox_delivered": outbox, "renewals_processed": renewals}
    )
