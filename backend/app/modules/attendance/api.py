from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import Actor, get_session_for_actor, require_permission
from app.kernel.pagination import OffsetPagination
from app.modules.attendance.service import (
    CheckInCreate,
    CheckInOut,
    check_in,
    list_check_ins,
)

router = APIRouter(prefix="/checkin", tags=["attendance"])


@router.post("", response_model=CheckInOut, status_code=201)
async def create_checkin(
    body: CheckInCreate,
    actor: Annotated[Actor, Depends(require_permission("attendance.manage"))],
    session: Annotated[AsyncSession, Depends(get_session_for_actor)],
) -> CheckInOut:
    result = await check_in(
        session,
        tenant_id=actor.tenant_id,
        member_id=body.member_id,
        branch_id=body.branch_id,
        source=body.source,
        device_id=body.device_id,
    )
    return CheckInOut.model_validate(result.check_in)


@router.get("", response_model=dict)
async def list_attendance(
    actor: Annotated[Actor, Depends(require_permission("attendance.view"))],
    session: Annotated[AsyncSession, Depends(get_session_for_actor)],
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    member_id: uuid.UUID | None = None,
    branch_id: uuid.UUID | None = None,
    result: str | None = None,
) -> dict:
    pagination = OffsetPagination(page=page, page_size=page_size)
    rows, total = await list_check_ins(
        session,
        tenant_id=actor.tenant_id,
        pagination=pagination,
        member_id=member_id,
        branch_id=branch_id,
        result=result,
    )
    return {
        "items": [CheckInOut.model_validate(r).model_dump() for r in rows],
        "total": total,
        "page": pagination.page,
        "page_size": pagination.page_size,
    }
