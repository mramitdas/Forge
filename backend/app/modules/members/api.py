from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import (
    Actor,
    assert_branch_in_scope,
    get_session_for_actor,
    require_permission,
)
from app.kernel.pagination import OffsetPagination
from app.modules.identity.service import get_effective_permissions
from app.modules.members.schemas import (
    MemberCreate,
    MemberOut,
    MemberTimelineOut,
    MemberUpdate,
    PageOut,
)
from app.modules.members.service import (
    create_member,
    get_member,
    list_member_timeline,
    list_members,
    update_member,
)

router = APIRouter(prefix="/members", tags=["members"])


@router.post("", response_model=MemberOut, status_code=201)
async def create(
    body: MemberCreate,
    actor: Annotated[Actor, Depends(require_permission("members.create"))],
    session: Annotated[AsyncSession, Depends(get_session_for_actor)],
) -> MemberOut:
    perms = await get_effective_permissions(session, actor.user_id)
    assert_branch_in_scope(perms, "members.create", body.branch_id)
    member = await create_member(
        session,
        tenant_id=actor.tenant_id,
        branch_id=body.branch_id,
        first_name=body.first_name,
        last_name=body.last_name,
        email=str(body.email) if body.email else None,
        phone=body.phone,
        gender=body.gender,
        status=body.status,
        notes=body.notes,
    )
    return MemberOut.model_validate(member)


@router.get("", response_model=PageOut)
async def list_members_endpoint(
    actor: Annotated[Actor, Depends(require_permission("members.view"))],
    session: Annotated[AsyncSession, Depends(get_session_for_actor)],
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: str | None = None,
    status: str | None = None,
    branch_id: uuid.UUID | None = None,
) -> PageOut:
    pagination = OffsetPagination(page=page, page_size=page_size)
    rows, total = await list_members(
        session,
        tenant_id=actor.tenant_id,
        pagination=pagination,
        search=search,
        status=status,
        branch_id=branch_id,
    )
    return PageOut(
        items=[MemberOut.model_validate(m) for m in rows],
        total=total,
        page=pagination.page,
        page_size=pagination.page_size,
    )


@router.get("/{member_id}", response_model=MemberOut)
async def detail(
    member_id: uuid.UUID,
    actor: Annotated[Actor, Depends(require_permission("members.view"))],
    session: Annotated[AsyncSession, Depends(get_session_for_actor)],
) -> MemberOut:
    member = await get_member(session, member_id)
    return MemberOut.model_validate(member)


@router.patch("/{member_id}", response_model=MemberOut)
async def update(
    member_id: uuid.UUID,
    body: MemberUpdate,
    actor: Annotated[Actor, Depends(require_permission("members.update"))],
    session: Annotated[AsyncSession, Depends(get_session_for_actor)],
) -> MemberOut:
    data = body.model_dump(exclude_unset=True)
    member = await update_member(session, member_id, data)
    return MemberOut.model_validate(member)


@router.get("/{member_id}/timeline", response_model=list[MemberTimelineOut])
async def timeline(
    member_id: uuid.UUID,
    actor: Annotated[Actor, Depends(require_permission("members.view"))],
    session: Annotated[AsyncSession, Depends(get_session_for_actor)],
) -> list[MemberTimelineOut]:
    rows = await list_member_timeline(session, member_id)
    return [MemberTimelineOut.model_validate(r) for r in rows]
