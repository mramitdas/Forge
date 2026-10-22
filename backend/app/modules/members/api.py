from __future__ import annotations

import uuid
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.deps import (
    Actor,
    assert_branch_in_scope,
    get_actor_from_query_token,
    get_session_for_actor,
    get_session_for_query_token,
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
    delete_member,
    get_member,
    list_member_timeline,
    list_members,
    set_member_avatar,
    update_member,
)
from app.modules.membership.service import (
    activate_subscription,
    create_subscription,
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
        country_code=body.country_code,
        gender=body.gender,
        status=body.status,
        is_active=body.is_active,
        notes=body.notes,
    )
    sub = await create_subscription(
        session,
        tenant_id=actor.tenant_id,
        member_id=member.id,
        plan_id=body.plan_id,
        branch_id=body.branch_id,
    )
    await activate_subscription(session, sub.id)
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
    member = await update_member(
        session,
        member_id,
        data,
        actor_id=actor.user_id,
        actor_name=actor.full_name,
    )
    return MemberOut.model_validate(member)


@router.delete("/{member_id}", status_code=204)
async def remove(
    member_id: uuid.UUID,
    actor: Annotated[Actor, Depends(require_permission("members.delete"))],
    session: Annotated[AsyncSession, Depends(get_session_for_actor)],
) -> None:
    await delete_member(
        session,
        member_id,
        actor_id=actor.user_id,
        actor_name=actor.full_name,
    )


@router.put("/{member_id}/avatar", status_code=200)
async def upload_avatar(
    member_id: uuid.UUID,
    file: Annotated[UploadFile, File(description="Image file")],
    actor: Annotated[Actor, Depends(require_permission("members.update"))],
    session: Annotated[AsyncSession, Depends(get_session_for_actor)],
) -> dict:
    await get_member(session, member_id)
    if file.content_type and not file.content_type.startswith("image/"):
        raise HTTPException(status_code=415, detail="Only image uploads are allowed")
    settings = get_settings()
    media_dir = Path(settings.media_dir) / "members"
    media_dir.mkdir(parents=True, exist_ok=True)
    ext = Path(file.filename or "").suffix.lower() or ".jpg"
    safe_ext = ext if ext in {".jpg", ".jpeg", ".png", ".webp", ".gif"} else ".jpg"
    filename = f"{member_id}{safe_ext}"
    dest = media_dir / filename
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty file")
    dest.write_bytes(content)
    relative = f"members/{filename}"
    member = await set_member_avatar(
        session, member_id, relative, actor_id=actor.user_id, actor_name=actor.full_name
    )
    return {"avatar_path": member.avatar_path}


@router.get("/{member_id}/avatar")
async def get_avatar(
    member_id: uuid.UUID,
    actor: Annotated[Actor, Depends(get_actor_from_query_token)],
    session: Annotated[AsyncSession, Depends(get_session_for_query_token)],
) -> FileResponse:
    perms = await get_effective_permissions(session, actor.user_id)
    if "members.view" not in perms:
        raise HTTPException(status_code=403, detail="Missing permission: members.view")
    member = await get_member(session, member_id)
    if not member.avatar_path:
        raise HTTPException(status_code=404, detail="No avatar")
    settings = get_settings()
    path = Path(settings.media_dir) / member.avatar_path
    if not path.exists():
        raise HTTPException(status_code=404, detail="Avatar file missing")
    return FileResponse(path)


@router.get("/{member_id}/timeline", response_model=list[MemberTimelineOut])
async def timeline(
    member_id: uuid.UUID,
    actor: Annotated[Actor, Depends(require_permission("members.view"))],
    session: Annotated[AsyncSession, Depends(get_session_for_actor)],
) -> list[MemberTimelineOut]:
    rows = await list_member_timeline(session, member_id)
    return [MemberTimelineOut.model_validate(r) for r in rows]
