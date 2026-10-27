from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ForbiddenError
from app.core.security import generate_temporary_password
from app.db.session import get_platform_session
from app.deps import Actor, get_actor_context, get_session_for_actor, require_permission
from app.modules.identity import service as identity_svc
from app.modules.identity.models import (
    Credential,
    PermissionCatalog,
    Role,
    RolePermission,
    User,
    UserRole,
)
from app.modules.identity.schemas import (
    AssignRoleRequest,
    ChangePasswordRequest,
    CreateEmployeeRequest,
    CreateRoleRequest,
    EmployeeCreatedOut,
    EmployeeOut,
    EmployeeUpdateRequest,
    LoginRequest,
    LogoutRequest,
    MeOut,
    MeUpdateRequest,
    PermissionOut,
    RefreshRequest,
    RoleOut,
    TokenResponse,
    UpdateRoleRequest,
    UserOut,
)
from app.modules.tenancy.models import Branch, Gym

router = APIRouter(prefix="/auth", tags=["auth"])
roles_router = APIRouter(prefix="/permissions", tags=["roles"])
employees_router = APIRouter(prefix="/employees", tags=["employees"])


@router.post("/login", response_model=TokenResponse)
async def login(
    body: LoginRequest,
    request: Request,
    session: Annotated[AsyncSession, Depends(get_platform_session)],
) -> TokenResponse:
    return await identity_svc.authenticate(
        session,
        email=str(body.email),
        password=body.password,
        ip=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh(
    body: RefreshRequest,
    request: Request,
    session: Annotated[AsyncSession, Depends(get_platform_session)],
) -> TokenResponse:
    return await identity_svc.refresh_tokens(
        session,
        refresh_token=body.refresh_token,
        ip=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )


@router.post("/logout", status_code=204)
async def logout(
    body: LogoutRequest,
    session: Annotated[AsyncSession, Depends(get_platform_session)],
) -> None:
    await identity_svc.logout(session, refresh_token=body.refresh_token)


async def _me_payload(session: AsyncSession, actor: Actor, user: User) -> MeOut:
    perms = await identity_svc.get_effective_permissions(session, actor.user_id)
    tenant_name = None
    branches: list[dict] = []
    if not actor.is_platform:
        gym_row = await session.get(Gym, actor.tenant_id)
        tenant_name = gym_row.name if gym_row else None
        branch_rows = await session.scalars(
            select(Branch).where(
                Branch.gym_id == actor.tenant_id, Branch.deleted_at.is_(None)
            )
        )
        branches = [
            {"id": str(b.id), "name": b.name, "timezone": b.timezone}
            for b in branch_rows
        ]
    role_rows = await session.scalars(
        select(Role.name)
        .join(UserRole, UserRole.role_id == Role.id)
        .where(UserRole.user_id == user.id, Role.deleted_at.is_(None))
    )
    role_name = ", ".join(sorted({r for r in role_rows if r})) or None
    cred = await session.scalar(select(Credential).where(Credential.user_id == user.id))
    return MeOut(
        user=UserOut.model_validate(user),
        tenant_id=actor.tenant_id,
        tenant_name=tenant_name,
        role_name=role_name,
        is_platform=actor.is_platform,
        permissions=sorted(perms.keys()),
        branches=branches,
        must_change=bool(cred.must_change) if cred else False,
    )


@router.get("/me", response_model=MeOut)
async def me(
    actor: Annotated[Actor, Depends(get_actor_context)],
    session: Annotated[AsyncSession, Depends(get_session_for_actor)],
) -> MeOut:
    user = await session.get(User, actor.user_id)
    return await _me_payload(session, actor, user)


@router.patch("/me", response_model=MeOut)
async def update_me_route(
    body: MeUpdateRequest,
    actor: Annotated[Actor, Depends(get_actor_context)],
    session: Annotated[AsyncSession, Depends(get_session_for_actor)],
) -> MeOut:
    if body.email is not None and body.email.lower() != actor.email.lower():
        raise ForbiddenError("Email can't be changed", code="EMAIL_FROZEN")
    user = await identity_svc.update_me(
        session,
        user_id=actor.user_id,
        full_name=body.full_name,
        email=body.email,
        first_name=body.first_name,
        last_name=body.last_name,
    )
    return await _me_payload(session, actor, user)


@router.post("/change-password", response_model=TokenResponse)
async def change_password_route(
    body: ChangePasswordRequest,
    actor: Annotated[Actor, Depends(get_actor_context)],
    session: Annotated[AsyncSession, Depends(get_session_for_actor)],
) -> TokenResponse:
    return await identity_svc.change_password(
        session,
        user_id=actor.user_id,
        current_password=body.current_password,
        new_password=body.new_password,
    )


@roles_router.get("", response_model=list[PermissionOut])
async def permission_catalog(
    actor: Annotated[Actor, Depends(require_permission("identity.manage"))],
    session: Annotated[AsyncSession, Depends(get_session_for_actor)],
) -> list[PermissionOut]:
    rows = await session.scalars(select(PermissionCatalog).order_by(PermissionCatalog.code))
    return [PermissionOut.model_validate(r) for r in rows]


@roles_router.get("/roles", response_model=list[RoleOut])
async def list_roles(
    actor: Annotated[Actor, Depends(require_permission("identity.manage"))],
    session: Annotated[AsyncSession, Depends(get_session_for_actor)],
) -> list[RoleOut]:
    rows = await session.scalars(
        select(Role)
        .where(Role.tenant_id == actor.tenant_id, Role.deleted_at.is_(None))
        .order_by(Role.name)
    )
    roles = list(rows)
    if roles:
        rps = await session.scalars(
            select(RolePermission).where(
                RolePermission.role_id.in_([r.id for r in roles])
            )
        )
        codes: dict[uuid.UUID, list[str]] = {}
        for rp in rps:
            codes.setdefault(rp.role_id, []).append(rp.permission_code)
    else:
        codes = {}
    out = []
    for r in roles:
        item = RoleOut.model_validate(r)
        item.permission_codes = sorted(codes.get(r.id, []))
        out.append(item)
    return out


@roles_router.patch("/roles/{role_id}", response_model=RoleOut)
async def update_role(
    role_id: uuid.UUID,
    body: UpdateRoleRequest,
    actor: Annotated[Actor, Depends(require_permission("identity.manage"))],
    session: Annotated[AsyncSession, Depends(get_session_for_actor)],
) -> RoleOut:
    role = await identity_svc.update_role(
        session,
        role_id=role_id,
        tenant_id=actor.tenant_id,
        permission_codes=body.permission_codes,
        name=body.name,
        description=body.description,
        is_active=body.is_active,
    )
    await session.flush()
    rps = await session.scalars(
        select(RolePermission.permission_code).where(
            RolePermission.role_id == role.id
        )
    )
    item = RoleOut.model_validate(role)
    item.permission_codes = sorted(rps)
    return item


@roles_router.post("/roles", response_model=RoleOut, status_code=201)
async def create_role(
    body: CreateRoleRequest,
    actor: Annotated[Actor, Depends(require_permission("identity.manage"))],
    session: Annotated[AsyncSession, Depends(get_session_for_actor)],
) -> RoleOut:
    role = await identity_svc.create_role(
        session,
        tenant_id=actor.tenant_id,
        name=body.name,
        description=body.description,
        permission_codes=body.permission_codes,
        branch_scope=body.branch_scope,
    )
    return RoleOut.model_validate(role)


@roles_router.delete("/roles/{role_id}", status_code=204)
async def delete_role(
    role_id: uuid.UUID,
    actor: Annotated[Actor, Depends(require_permission("identity.manage"))],
    session: Annotated[AsyncSession, Depends(get_session_for_actor)],
) -> None:
    await identity_svc.delete_role(
        session, role_id=role_id, tenant_id=actor.tenant_id, actor_id=actor.user_id
    )


@employees_router.post("", response_model=EmployeeCreatedOut, status_code=201)
async def create_employee(
    body: CreateEmployeeRequest,
    actor: Annotated[Actor, Depends(require_permission("identity.manage"))],
    session: Annotated[AsyncSession, Depends(get_session_for_actor)],
) -> EmployeeCreatedOut:
    temporary_password = body.password or generate_temporary_password()
    user = await identity_svc.create_employee(
        session,
        tenant_id=actor.tenant_id,
        email=str(body.email),
        full_name=body.full_name,
        password=temporary_password,
        phone=body.phone,
        role_ids=body.role_ids,
    )
    roles = await identity_svc.employee_roles(
        session, tenant_id=actor.tenant_id, user_ids=[user.id]
    )
    role_list = roles.get(user.id, [])
    return EmployeeCreatedOut(
        **UserOut.model_validate(user).model_dump(),
        role_ids=[r.id for r in role_list],
        role_names=[r.name for r in role_list],
        temporary_password=temporary_password,
    )


@employees_router.get("", response_model=list[EmployeeOut])
async def list_employees(
    actor: Annotated[Actor, Depends(require_permission("identity.view"))],
    session: Annotated[AsyncSession, Depends(get_session_for_actor)],
) -> list[EmployeeOut]:
    rows = await session.scalars(
        select(User)
        .where(User.tenant_id == actor.tenant_id, User.deleted_at.is_(None))
        .order_by(User.full_name)
    )
    users = list(rows)
    roles = await identity_svc.employee_roles(
        session, tenant_id=actor.tenant_id, user_ids=[u.id for u in users]
    )
    result: list[EmployeeOut] = []
    for user in users:
        role_list = roles.get(user.id, [])
        if any(role.name == "Gym Owner" for role in role_list):
            continue
        result.append(
            EmployeeOut(
                **UserOut.model_validate(user).model_dump(),
                role_ids=[r.id for r in role_list],
                role_names=[r.name for r in role_list],
            )
        )
    return result


@employees_router.patch("/{user_id}", response_model=EmployeeOut)
async def update_employee(
    user_id: uuid.UUID,
    body: EmployeeUpdateRequest,
    actor: Annotated[Actor, Depends(require_permission("identity.manage"))],
    session: Annotated[AsyncSession, Depends(get_session_for_actor)],
) -> EmployeeOut:
    user = await identity_svc.update_employee(
        session,
        tenant_id=actor.tenant_id,
        user_id=user_id,
        full_name=body.full_name,
        phone=body.phone,
        is_active=body.is_active,
        role_ids=body.role_ids,
    )
    roles = await identity_svc.employee_roles(
        session, tenant_id=actor.tenant_id, user_ids=[user.id]
    )
    role_list = roles.get(user.id, [])
    return EmployeeOut(
        **UserOut.model_validate(user).model_dump(),
        role_ids=[r.id for r in role_list],
        role_names=[r.name for r in role_list],
    )


@employees_router.delete("/{user_id}", status_code=204)
async def delete_employee(
    user_id: uuid.UUID,
    actor: Annotated[Actor, Depends(require_permission("identity.manage"))],
    session: Annotated[AsyncSession, Depends(get_session_for_actor)],
) -> None:
    await identity_svc.delete_employee(
        session, tenant_id=actor.tenant_id, user_id=user_id, actor_id=actor.user_id
    )


@employees_router.post("/assign", status_code=204)
async def assign_role(
    body: AssignRoleRequest,
    actor: Annotated[Actor, Depends(require_permission("identity.manage"))],
    session: Annotated[AsyncSession, Depends(get_session_for_actor)],
) -> None:
    await identity_svc.assign_role(session, user_id=body.user_id, role_id=body.role_id)
