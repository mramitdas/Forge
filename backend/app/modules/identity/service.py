from __future__ import annotations

import hashlib
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.errors import (
    ConflictError,
    ForbiddenError,
    NotFoundError,
    UnauthenticatedError,
    ValidationError,
)
from app.core.security import (
    create_access_token,
    generate_refresh_token,
    hash_password,
    password_rule_failures,
    verify_password,
)
from app.core.tenant import TenantContext, reset_tenant_context, set_tenant_context
from app.db.session import get_sessionmaker
from app.modules.identity.models import (
    Credential,
    PermissionCatalog,
    RefreshToken,
    Role,
    RolePermission,
    User,
    UserRole,
    split_full_name,
)
from app.modules.identity.permissions import PERMISSIONS, ROLE_TEMPLATES, template_permission_codes
from app.modules.identity.schemas import TokenResponse


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


async def _load_user_with_credential(
    session: AsyncSession, email: str
) -> tuple[User, Credential] | None:
    result = await session.execute(
        select(User, Credential)
        .join(Credential, Credential.user_id == User.id)
        .where(User.email == email.lower(), User.deleted_at.is_(None))
    )
    return result.first()


async def _issue_for_user(
    session: AsyncSession,
    user: User,
    *,
    family_id: uuid.UUID | None = None,
    must_change: bool = False,
    ip: str | None = None,
    user_agent: str | None = None,
) -> TokenResponse:
    settings = get_settings()
    access, _ = create_access_token(
        user_id=str(user.id),
        tenant_id=str(user.tenant_id),
        claims={"is_platform": user.is_platform, "must_change": must_change},
    )
    raw_refresh = generate_refresh_token()
    session.add(
        RefreshToken(
            user_id=user.id,
            token_hash=hash_token(raw_refresh),
            family_id=family_id or uuid.uuid4(),
            expires_at=datetime.now(UTC) + timedelta(seconds=settings.refresh_token_ttl_seconds),
            created_ip=ip,
            user_agent=user_agent,
        )
    )
    return TokenResponse(
        access_token=access,
        refresh_token=raw_refresh,
        expires_in=settings.access_token_ttl_seconds,
        must_change=must_change,
    )


async def issue_tokens(
    session: AsyncSession,
    user: User,
    *,
    ip: str | None = None,
    user_agent: str | None = None,
) -> TokenResponse:
    return await _issue_for_user(session, user, ip=ip, user_agent=user_agent)


async def _ensure_role_active(session: AsyncSession, user_id: uuid.UUID) -> None:
    """Block login/refresh while every assigned role is disabled.

    Users with no roles keep the existing powerless-but-logged-in behavior;
    only "has roles, none enabled" is rejected.
    """
    assigned = list(
        await session.scalars(
            select(Role.id)
            .join(UserRole, UserRole.role_id == Role.id)
            .where(UserRole.user_id == user_id, Role.deleted_at.is_(None))
        )
    )
    if not assigned:
        return
    enabled = await session.scalar(
        select(Role.id).where(
            Role.id.in_(assigned),
            Role.is_active.is_(True),
            Role.deleted_at.is_(None),
        )
    )
    if enabled is None:
        raise ForbiddenError(
            "All your roles are disabled — contact your gym owner",
            code="ROLE_DISABLED",
        )


async def authenticate(
    session: AsyncSession,
    *,
    email: str,
    password: str,
    ip: str | None = None,
    user_agent: str | None = None,
) -> TokenResponse:
    row = await _load_user_with_credential(session, email)
    if row is None:
        raise UnauthenticatedError("Invalid credentials", code="INVALID_CREDENTIALS")
    user, credential = row
    if not user.is_active:
        raise UnauthenticatedError("Account is disabled", code="ACCOUNT_DISABLED")
    if not verify_password(password, credential.password_hash):
        raise UnauthenticatedError("Invalid credentials", code="INVALID_CREDENTIALS")
    await _ensure_role_active(session, user.id)
    return await _issue_for_user(
        session, user, must_change=credential.must_change, ip=ip, user_agent=user_agent
    )


async def _email_taken_elsewhere(email: str, *, exclude_user_id: uuid.UUID) -> bool:
    """Cross-tenant uniqueness probe for the global login key.

    The request session is stamped with the actor's tenant and `users` has
    FORCE ROW LEVEL SECURITY, so it cannot see other tenants' rows. The check
    runs on a short-lived platform-scoped session instead (same pattern as
    `resolve_actor`), while the UPDATE stays on the request session.
    """
    maker = get_sessionmaker()
    token = set_tenant_context(TenantContext(tenant_id=None, platform_scope=True))
    try:
        async with maker() as session:
            await session.begin()
            existing = await session.scalar(
                select(User.id).where(
                    User.email == email,
                    User.id != exclude_user_id,
                    User.deleted_at.is_(None),
                )
            )
            return existing is not None
    finally:
        reset_tenant_context(token)


async def update_me(
    session: AsyncSession,
    *,
    user_id: uuid.UUID,
    full_name: str | None = None,
    email: str | None = None,
    first_name: str | None = None,
    last_name: str | None = None,
) -> User:
    """Update the caller's profile. Split-name fields win over full_name if both are sent."""
    user = await session.get(User, user_id)
    if user is None or user.deleted_at is not None:
        raise NotFoundError("User not found", code="NOT_FOUND")
    if first_name is not None or last_name is not None:
        new_first = (first_name if first_name is not None else user.first_name).strip()
        new_last = (last_name if last_name is not None else user.last_name).strip()
        if not new_first:
            raise ValidationError("First name is required", code="VALIDATION")
        composed = f"{new_first} {new_last}".strip()
        if len(composed) > 200:
            raise ValidationError("Full name is too long", code="VALIDATION")
        user.first_name = new_first
        user.last_name = new_last
        user.full_name = composed
    elif full_name is not None:
        user.full_name = full_name.strip()
        user.first_name, user.last_name = split_full_name(user.full_name)
    if email is not None:
        normalized = email.lower()
        if normalized != user.email and await _email_taken_elsewhere(
            normalized, exclude_user_id=user.id
        ):
            raise ConflictError("User already exists", code="EMAIL_TAKEN")
        user.email = normalized
    try:
        await session.flush()
    except IntegrityError:
        # Concurrent claim of the same same-tenant email races past the
        # check-then-update probe and trips uq_users_tenant_email_active.
        await session.rollback()
        raise ConflictError("User already exists", code="EMAIL_TAKEN") from None
    return user


async def refresh_tokens(
    session: AsyncSession,
    *,
    refresh_token: str,
    ip: str | None = None,
    user_agent: str | None = None,
) -> TokenResponse:
    token_hash = hash_token(refresh_token)
    result = await session.execute(
        select(RefreshToken).where(RefreshToken.token_hash == token_hash)
    )
    record = result.scalar_one_or_none()
    if record is None:
        raise UnauthenticatedError("Invalid refresh token", code="INVALID_REFRESH_TOKEN")
    if record.is_expired or record.is_revoked:
        # Token reuse after rotation: revoke the entire family and persist the
        # revocation before raising, otherwise the request rollback discards it.
        await _revoke_family(session, record.family_id)
        await session.commit()
        raise UnauthenticatedError("Refresh token expired", code="REFRESH_TOKEN_EXPIRED")
    user = await session.get(User, record.user_id)
    if user is None or not user.is_active:
        raise UnauthenticatedError("Account is disabled", code="ACCOUNT_DISABLED")
    await _ensure_role_active(session, user.id)
    credential = await session.scalar(
        select(Credential).where(Credential.user_id == user.id)
    )
    record.revoked_at = datetime.now(UTC)
    return await _issue_for_user(
        session,
        user,
        family_id=record.family_id,
        must_change=bool(credential.must_change) if credential else False,
        ip=ip,
        user_agent=user_agent,
    )


async def _revoke_family(session: AsyncSession, family_id: uuid.UUID) -> None:
    result = await session.execute(
        select(RefreshToken).where(RefreshToken.family_id == family_id)
    )
    for record in result.scalars():
        record.revoked_at = datetime.now(UTC)


async def logout(session: AsyncSession, *, refresh_token: str) -> None:
    token_hash = hash_token(refresh_token)
    result = await session.execute(
        select(RefreshToken).where(RefreshToken.token_hash == token_hash)
    )
    record = result.scalar_one_or_none()
    if record is not None:
        record.revoked_at = datetime.now(UTC)


async def change_password(
    session: AsyncSession,
    *,
    user_id: uuid.UUID,
    current_password: str,
    new_password: str,
) -> TokenResponse:
    result = await session.execute(
        select(User, Credential)
        .join(Credential, Credential.user_id == User.id)
        .where(User.id == user_id, User.deleted_at.is_(None))
    )
    row = result.first()
    if row is None:
        raise UnauthenticatedError("Account not found", code="INVALID_CREDENTIALS")
    user, credential = row
    if not verify_password(current_password, credential.password_hash):
        raise ValidationError("Current password is incorrect", code="INVALID_CURRENT_PASSWORD")
    failures = password_rule_failures(new_password)
    if failures:
        raise ValidationError(
            "Password does not meet the complexity requirements",
            code="PASSWORD_TOO_WEAK",
            details={"failed": failures},
        )
    credential.password_hash = hash_password(new_password)
    credential.must_change = False
    records = await session.scalars(
        select(RefreshToken).where(
            RefreshToken.user_id == user_id, RefreshToken.revoked_at.is_(None)
        )
    )
    for record in records:
        record.revoked_at = datetime.now(UTC)
    await session.flush()
    return await _issue_for_user(session, user)


async def get_effective_permissions(
    session: AsyncSession, user_id: uuid.UUID
) -> dict[str, set[uuid.UUID] | None]:
    """Return {permission_code: allowed_branch_ids or None (all branches)}."""
    result = await session.execute(
        select(RolePermission)
        .join(UserRole, UserRole.role_id == RolePermission.role_id)
        .join(Role, Role.id == RolePermission.role_id)
        .where(
            UserRole.user_id == user_id,
            Role.deleted_at.is_(None),
            Role.is_active.is_(True),
        )
    )
    perms: dict[str, set[uuid.UUID] | None] = {}
    for rp in result.scalars():
        branches = None
        if rp.branch_scope == "list" and rp.branch_ids:
            branches = set(uuid.UUID(b) if isinstance(b, str) else b for b in rp.branch_ids)
        existing = perms.get(rp.permission_code)
        if existing is None:
            perms[rp.permission_code] = branches
        elif branches is not None and existing is not None:
            existing.update(branches)
    # Gym capabilities are two-tier: manage always includes view.
    for code in list(perms):
        if code.endswith(".manage") and not code.startswith("platform."):
            perms.setdefault(code[: -len(".manage")] + ".view", perms[code])
    return perms


async def create_role(
    session: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    name: str,
    description: str | None,
    permission_codes: list[str],
    branch_scope: str = "all",
    branch_ids: list[uuid.UUID] | None = None,
    is_system: bool = False,
    is_editable: bool = True,
) -> Role:
    catalog_codes = set(await session.scalars(select(PermissionCatalog.code)))
    unknown = set(permission_codes) - catalog_codes
    if unknown:
        raise ValidationError(
            "Unknown permission codes", code="UNKNOWN_PERMISSIONS", details=list(unknown)
        )
    role = Role(
        tenant_id=tenant_id,
        name=name,
        description=description,
        is_system=is_system,
        is_editable=is_editable,
    )
    session.add(role)
    await session.flush()
    for code in permission_codes:
        session.add(
            RolePermission(
                role_id=role.id,
                permission_code=code,
                branch_scope=branch_scope,
                branch_ids=[str(b) for b in branch_ids] if branch_ids else None,
            )
        )
    return role


async def update_role(
    session: AsyncSession,
    *,
    role_id: uuid.UUID,
    tenant_id: uuid.UUID,
    permission_codes: list[str],
    name: str | None = None,
    description: str | None = None,
    is_active: bool | None = None,
) -> Role:
    """Update a role's name/description/permission set. Refuses locked roles."""
    role = await session.get(Role, role_id)
    if role is None or role.tenant_id != tenant_id:
        raise NotFoundError("Role not found", code="NOT_FOUND")
    if not role.is_editable:
        raise ValidationError(
            "This role is locked and cannot be edited", code="ROLE_LOCKED"
        )
    if is_active is False and role.is_system:
        raise ForbiddenError(
            "System roles cannot be disabled", code="ROLE_LOCKED"
        )
    catalog_codes = set(await session.scalars(select(PermissionCatalog.code)))
    unknown = set(permission_codes) - catalog_codes
    if unknown:
        raise ValidationError(
            "Unknown permission codes", code="UNKNOWN_PERMISSIONS", details=list(unknown)
        )
    if name is not None:
        role.name = name
    if description is not None:
        role.description = description
    if is_active is not None:
        role.is_active = is_active
    existing = await session.scalars(
        select(RolePermission).where(RolePermission.role_id == role_id)
    )
    for rp in existing:
        await session.delete(rp)
    for code in permission_codes:
        session.add(RolePermission(role_id=role_id, permission_code=code))
    return role


async def delete_role(
    session: AsyncSession,
    *,
    role_id: uuid.UUID,
    tenant_id: uuid.UUID,
    actor_id: uuid.UUID | None = None,
) -> None:
    """Soft-delete a custom role. Refuses locked roles and roles still in use."""
    role = await session.get(Role, role_id)
    if role is None or role.tenant_id != tenant_id or role.deleted_at is not None:
        raise NotFoundError("Role not found", code="NOT_FOUND")
    if not role.is_editable:
        raise ValidationError(
            "This role is locked and cannot be deleted", code="ROLE_LOCKED"
        )
    assignments = await session.scalar(
        select(func.count()).select_from(UserRole).where(UserRole.role_id == role_id)
    )
    if assignments:
        raise ConflictError(
            f"This role is assigned to {assignments} employee(s) and cannot be deleted",
            code="ROLE_IN_USE",
        )
    role.deleted_at = datetime.now(UTC)
    role.deleted_by = actor_id
    await session.flush()


async def seed_platform_roles(session: AsyncSession, platform_tenant_id: uuid.UUID) -> Role:
    """Idempotently create the platform-scoped roles in the platform tenant."""
    template = ROLE_TEMPLATES["platform_owner"]
    role = await session.scalar(
        select(Role).where(
            Role.tenant_id == platform_tenant_id,
            Role.name == template["name"],
            Role.deleted_at.is_(None),
        )
    )
    if role is not None:
        return role
    return await create_role(
        session,
        tenant_id=platform_tenant_id,
        name=template["name"],
        description=template.get("description"),
        permission_codes=template_permission_codes(template),
        is_system=template.get("is_system", False),
        is_editable=template.get("is_editable", True),
    )


async def create_employee(
    session: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    email: str,
    full_name: str,
    password: str,
    phone: str | None = None,
    role_ids: list[uuid.UUID] | None = None,
) -> User:
    existing = await session.execute(
        select(User.id).where(
            User.tenant_id == tenant_id, User.email == email.lower(), User.deleted_at.is_(None)
        )
    )
    if existing.first() is not None:
        raise ConflictError("User already exists", code="EMAIL_TAKEN")
    first, last = split_full_name(full_name)
    user = User(
        tenant_id=tenant_id,
        email=email.lower(),
        full_name=full_name,
        first_name=first,
        last_name=last,
        phone=phone,
        is_active=True,
        is_platform=False,
    )
    user.credential = Credential(password_hash=hash_password(password))
    session.add(user)
    await session.flush()
    if role_ids:
        roles = await session.scalars(
            select(Role).where(Role.id.in_(role_ids), Role.tenant_id == tenant_id)
        )
        for role in roles:
            session.add(UserRole(user_id=user.id, role_id=role.id))
    return user


async def employee_roles(
    session: AsyncSession, *, tenant_id: uuid.UUID, user_ids: list[uuid.UUID]
) -> dict[uuid.UUID, list[Role]]:
    """Map user_id → active tenant roles for the given employees."""
    if not user_ids:
        return {}
    rows = await session.execute(
        select(UserRole.user_id, Role)
        .join(Role, Role.id == UserRole.role_id)
        .where(
            UserRole.user_id.in_(user_ids),
            Role.tenant_id == tenant_id,
            Role.deleted_at.is_(None),
        )
    )
    mapping: dict[uuid.UUID, list[Role]] = {}
    for user_id, role in rows.all():
        mapping.setdefault(user_id, []).append(role)
    return mapping


async def update_employee(
    session: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    user_id: uuid.UUID,
    full_name: str | None = None,
    phone: str | None = None,
    is_active: bool | None = None,
    role_ids: list[uuid.UUID] | None = None,
) -> User:
    user = await session.scalar(
        select(User).where(
            User.id == user_id, User.tenant_id == tenant_id, User.deleted_at.is_(None)
        )
    )
    if user is None:
        raise NotFoundError("Employee not found", code="NOT_FOUND")
    if full_name is not None:
        user.full_name = full_name
        user.first_name, user.last_name = split_full_name(full_name)
    if phone is not None:
        user.phone = phone or None
    if is_active is not None:
        user.is_active = is_active
    if role_ids is not None:
        existing = await session.scalars(select(UserRole).where(UserRole.user_id == user_id))
        for assignment in existing:
            await session.delete(assignment)
        if role_ids:
            roles = await session.scalars(
                select(Role).where(
                    Role.id.in_(role_ids),
                    Role.tenant_id == tenant_id,
                    Role.deleted_at.is_(None),
                )
            )
            for role in roles:
                session.add(UserRole(user_id=user.id, role_id=role.id))
    await session.flush()
    return user


async def delete_employee(
    session: AsyncSession, *, tenant_id: uuid.UUID, user_id: uuid.UUID, actor_id: uuid.UUID
) -> None:
    if user_id == actor_id:
        raise ConflictError("You cannot delete your own account", code="SELF_DELETE")
    user = await session.scalar(
        select(User).where(
            User.id == user_id, User.tenant_id == tenant_id, User.deleted_at.is_(None)
        )
    )
    if user is None:
        raise NotFoundError("Employee not found", code="NOT_FOUND")
    user.is_active = False
    user.deleted_at = datetime.now(UTC)
    await session.flush()


async def assign_role(session: AsyncSession, *, user_id: uuid.UUID, role_id: uuid.UUID) -> None:
    user = await session.get(User, user_id)
    role = await session.get(Role, role_id)
    if user is None or role is None:
        raise NotFoundError("User or role not found", code="NOT_FOUND")
    if user.tenant_id != role.tenant_id:
        raise ConflictError("Cross-tenant role assignment", code="TENANT_MISMATCH")
    session.add(UserRole(user_id=user_id, role_id=role_id))


def seed_catalog(session: AsyncSession) -> None:
    """Idempotently seed the global permission catalog (migration-time helper)."""
    from sqlalchemy import select as sa_select

    existing = set(session.execute(sa_select(PermissionCatalog.code)).scalars())
    for item in PERMISSIONS:
        if item["code"] not in existing:
            session.add(
                PermissionCatalog(
                    code=item["code"], module=item["module"], description=item["description"]
                )
            )

