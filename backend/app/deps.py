from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Annotated, Any

from fastapi import Depends, Header

from app.core.errors import ForbiddenError, UnauthenticatedError
from app.core.logging import get_logger
from app.core.security import decode_token
from app.core.tenant import TenantContext, reset_tenant_context, set_tenant_context
from app.db.session import get_sessionmaker
from app.modules.identity.models import User
from app.modules.identity.service import get_effective_permissions

logger = get_logger(__name__)


@dataclass(frozen=True, slots=True)
class Actor:
    user_id: uuid.UUID
    tenant_id: uuid.UUID
    is_platform: bool
    email: str
    full_name: str
    must_change: bool = False


async def resolve_actor(authorization: str | None) -> Actor:
    if not authorization or not authorization.startswith("Bearer "):
        raise UnauthenticatedError("Missing bearer token", code="MISSING_TOKEN")
    token = authorization.removeprefix("Bearer ").strip()
    payload = decode_token(token, expected_type="access")

    # Load the user to confirm it still exists and is active. Runs in platform scope
    # because a gym user's row lives in its own tenant.
    maker = get_sessionmaker()
    context_token = set_tenant_context(TenantContext(tenant_id=None, platform_scope=True))
    try:
        async with maker() as session:
            await session.begin()
            user = await session.get(User, uuid.UUID(payload["sub"]))
            if user is None or not user.is_active:
                raise UnauthenticatedError("Account is disabled", code="ACCOUNT_DISABLED")
            return Actor(
                user_id=user.id,
                tenant_id=user.tenant_id,
                is_platform=user.is_platform,
                email=user.email,
                full_name=user.full_name,
                must_change=bool(payload.get("must_change", False)),
            )
    finally:
        reset_tenant_context(context_token)


async def get_actor_context(
    authorization: Annotated[str | None, Header()] = None,
) -> Actor:
    actor = await resolve_actor(authorization)
    ctx = TenantContext(
        tenant_id=actor.tenant_id,
        platform_scope=actor.is_platform,
    )
    set_tenant_context(ctx)
    return actor


async def get_actor_from_query_token(
    authorization: Annotated[str | None, Header()] = None,
    token: str | None = None,
) -> Actor:
    """Actor from the Authorization header, falling back to a `token` query
    param (used for <img> tags that cannot set request headers)."""
    auth = authorization or (f"Bearer {token}" if token else None)
    actor = await resolve_actor(auth)
    ctx = TenantContext(
        tenant_id=actor.tenant_id,
        platform_scope=actor.is_platform,
    )
    set_tenant_context(ctx)
    return actor


async def get_session_for_actor(
    actor: Annotated[Actor, Depends(get_actor_context)],
):
    """Request session for authenticated routes, stamped with the actor's tenant."""
    from app.db.session import get_sessionmaker

    maker = get_sessionmaker()
    async with maker() as session:
        await session.begin()
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
        else:
            await session.commit()


async def get_session_for_query_token(
    actor: Annotated[Actor, Depends(get_actor_from_query_token)],
):
    """Session dependency for requests authenticated via a `token` query param
    (e.g. <img> tags). Stamps the actor's tenant like the header variant."""
    from app.db.session import get_sessionmaker

    maker = get_sessionmaker()
    async with maker() as session:
        await session.begin()
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
        else:
            await session.commit()


def require_platform(
    actor: Annotated[Actor, Depends(get_actor_context)],
) -> Actor:
    if not actor.is_platform:
        raise ForbiddenError(
            "Platform scope required",
            code="PLATFORM_SCOPE_REQUIRED",
        )
    return actor


def assert_branch_in_scope(
    perms: dict[str, set[uuid.UUID] | None], code: str, branch_id: uuid.UUID
) -> None:
    """Raise unless the actor's permission allows operations on branch_id."""
    branches = perms.get(code)
    if branches is not None and branch_id not in branches:
        raise ForbiddenError(
            f"Branch {branch_id} not in scope for {code}",
            code="BRANCH_OUT_OF_SCOPE",
            details={"permission": code, "branch_id": str(branch_id)},
        )


def require_permission(code: str, branch_id: uuid.UUID | None = None):
    """Dependency factory: grants access only if the actor holds `code`.

    Optionally enforces branch scoping: when the permission is restricted to a
    branch list and `branch_id` is given, access requires membership in that list.
    """

    async def checker(
        actor: Annotated[Actor, Depends(get_actor_context)],
        session: Annotated[Any, Depends(get_session_for_actor)],
    ) -> Actor:
        perms = await get_effective_permissions(session, actor.user_id)
        branches = perms.get(code)
        if branches is None and code not in perms:
            raise ForbiddenError(
                f"Missing permission: {code}",
                code="INSUFFICIENT_PERMISSION",
                details={"permission": code},
            )
        if branch_id is not None and branches is not None and branch_id not in branches:
            raise ForbiddenError(
                f"Branch {branch_id} not in scope for {code}",
                code="BRANCH_OUT_OF_SCOPE",
                details={"permission": code, "branch_id": str(branch_id)},
            )
        return actor

    return checker


async def reject_if_must_change(
    actor: Annotated[Actor, Depends(get_actor_from_query_token)],
) -> None:
    """Reject authenticated requests until the flagged user changes password.

    Resolves via the query-token superset (header OR ?token=) because <img>
    routes like member avatars authenticate without an Authorization header;
    a header-only resolver here would 401 them before their own resolver runs.
    """
    if actor.must_change:
        raise ForbiddenError("Password change required", code="MUST_CHANGE_PASSWORD")
