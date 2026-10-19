from __future__ import annotations

import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.core.config import get_settings
from app.core.errors import AppError, to_http_exception
from app.core.logging import configure_logging, get_logger
from app.db.session import get_engine
from app.deps import reject_if_must_change
from app.kernel.events import Dispatcher
from app.modules.attendance.api import router as attendance_router
from app.modules.billing.api import router as billing_router
from app.modules.expenses.api import router as expenses_router
from app.modules.identity.api import employees_router, roles_router
from app.modules.identity.api import router as auth_router
from app.modules.members.api import router as members_router
from app.modules.membership.api import router as membership_router
from app.modules.membership.renewal import start_renewal_worker
from app.modules.notifications.api import router as notifications_router
from app.modules.notifications.service import register_handlers
from app.modules.tenancy.api import (
    platform_router,
    settings_router,
    subscriptions_router,
    tenant_router,
)

logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    configure_logging()
    register_handlers()
    dispatcher = Dispatcher()
    settings = get_settings()
    tasks = []
    if not settings.debug:
        import asyncio

        tasks.append(asyncio.create_task(dispatcher.run_forever(settings.outbox_poll_interval_seconds)))
        logger.info("outbox dispatcher started")
        renewal_worker = start_renewal_worker()
        if renewal_worker is not None:
            tasks.append(asyncio.create_task(renewal_worker.run_forever(settings.renewal_interval_seconds)))
            logger.info("renewal worker started")
    yield
    for task in tasks:
        task.cancel()


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title=settings.app_name,
        version="0.1.0",
        docs_url=f"{settings.api_prefix}/docs",
        openapi_url=f"{settings.api_prefix}/openapi.json",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,
        allow_credentials=settings.cors_allow_credentials,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.middleware("http")
    async def request_context(request: Request, call_next):
        request_id = request.headers.get("x-request-id", uuid.uuid4().hex[:16])
        import structlog

        structlog.contextvars.bind_contextvars(request_id=request_id, path=request.url.path)
        response = await call_next(request)
        response.headers["x-request-id"] = request_id
        structlog.contextvars.unbind_contextvars("request_id", "path")
        return response

    @app.exception_handler(AppError)
    async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
        request_id = request.headers.get("x-request-id", "")
        detail = to_http_exception(exc).detail
        detail["error"]["request_id"] = request_id
        return JSONResponse(status_code=exc.http_status, content=detail)

    @app.get("/health/live", include_in_schema=False)
    async def health_live() -> dict:
        return {"status": "ok"}

    @app.get("/health/ready", include_in_schema=False)
    async def health_ready() -> dict:
        try:
            async with get_engine().connect() as conn:
                await conn.execute(text("SELECT 1"))
        except Exception as exc:
            logger.error("health check failed", error=str(exc))
            return JSONResponse(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                content={"status": "unhealthy"},
            )
        return {"status": "ready"}

    gate = [Depends(reject_if_must_change)]
    app.include_router(auth_router, prefix=settings.api_prefix)
    app.include_router(roles_router, prefix=settings.api_prefix, dependencies=gate)
    app.include_router(employees_router, prefix=settings.api_prefix, dependencies=gate)
    app.include_router(platform_router, prefix=settings.api_prefix, dependencies=gate)
    app.include_router(tenant_router, prefix=settings.api_prefix, dependencies=gate)
    app.include_router(settings_router, prefix=settings.api_prefix, dependencies=gate)
    app.include_router(subscriptions_router, prefix=settings.api_prefix, dependencies=gate)
    app.include_router(members_router, prefix=settings.api_prefix, dependencies=gate)
    app.include_router(membership_router, prefix=settings.api_prefix, dependencies=gate)
    app.include_router(billing_router, prefix=settings.api_prefix, dependencies=gate)
    app.include_router(expenses_router, prefix=settings.api_prefix, dependencies=gate)
    app.include_router(attendance_router, prefix=settings.api_prefix, dependencies=gate)
    app.include_router(notifications_router, prefix=settings.api_prefix, dependencies=gate)
    return app


app = create_app()
