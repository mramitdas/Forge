from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ConflictError, NotFoundError
from app.kernel.events import bus
from app.kernel.pagination import OffsetPagination
from app.modules.members.models import MEMBER_STATUSES, Member, MemberTimeline


def _validate_status(status: str) -> str:
    if status not in MEMBER_STATUSES:
        raise ConflictError("Invalid member status", code="INVALID_STATUS")
    return status


async def create_member(
    session: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    branch_id: uuid.UUID,
    first_name: str,
    last_name: str | None,
    email: str | None,
    phone: str | None,
    gender: str | None,
    status: str,
    notes: str | None,
) -> Member:
    _validate_status(status)
    if email:
        dup = await session.execute(
            select(Member.id).where(
                Member.tenant_id == tenant_id,
                Member.email == email.lower(),
                Member.deleted_at.is_(None),
            )
        )
        if dup.first() is not None:
            raise ConflictError("Member email already exists", code="EMAIL_TAKEN")
    member = Member(
        tenant_id=tenant_id,
        branch_id=branch_id,
        first_name=first_name,
        last_name=last_name,
        email=email.lower() if email else None,
        phone=phone,
        gender=gender,
        status=status,
        notes=notes,
        joined_at=datetime.now() if status == "active" else None,
    )
    session.add(member)
    await session.flush()
    session.add(
        MemberTimeline(
            tenant_id=tenant_id,
            member_id=member.id,
            action="member.created",
            payload={"status": status},
        )
    )
    await bus.emit(
        session,
        tenant_id=tenant_id,
        aggregate_type="member",
        aggregate_id=member.id,
        event_type="members.member.created",
        payload={"member_id": str(member.id), "branch_id": str(branch_id), "status": status},
    )
    return member


async def get_member(session: AsyncSession, member_id: uuid.UUID) -> Member:
    member = await session.get(Member, member_id)
    if member is None or member.deleted_at is not None:
        raise NotFoundError("Member not found", code="NOT_FOUND")
    return member


async def update_member(session: AsyncSession, member_id: uuid.UUID, data: dict) -> Member:
    member = await get_member(session, member_id)
    if data.get("status"):
        data["status"] = _validate_status(data["status"])
    if data.get("email"):
        data["email"] = data["email"].lower()
    for field, value in data.items():
        if value is not None:
            setattr(member, field, value)
    member.version += 1
    session.add(
        MemberTimeline(
            tenant_id=member.tenant_id,
            member_id=member.id,
            action="member.updated",
            payload={"fields": list(data.keys())},
        )
    )
    return member


async def list_members(
    session: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    pagination: OffsetPagination,
    search: str | None = None,
    status: str | None = None,
    branch_id: uuid.UUID | None = None,
) -> tuple[list[Member], int]:
    stmt = select(Member).where(
        Member.tenant_id == tenant_id, Member.deleted_at.is_(None)
    )
    if status:
        stmt = stmt.where(Member.status == status)
    if branch_id:
        stmt = stmt.where(Member.branch_id == branch_id)
    if search:
        like = f"%{search.lower()}%"
        stmt = stmt.where(
            or_(
                func.lower(Member.first_name).like(like),
                func.lower(Member.last_name).like(like),
                func.lower(Member.email).like(like),
                Member.phone.like(like),
            )
        )
    total = await session.scalar(
        select(func.count()).select_from(stmt.subquery())
    )
    rows = (
        await session.execute(
            stmt.order_by(Member.created_at.desc())
            .offset(pagination.offset())
            .limit(pagination.page_size)
        )
    ).scalars().all()
    return list(rows), total or 0


async def list_member_timeline(
    session: AsyncSession, member_id: uuid.UUID, limit: int = 50
) -> list[MemberTimeline]:
    await get_member(session, member_id)
    rows = await session.scalars(
        select(MemberTimeline)
        .where(MemberTimeline.member_id == member_id)
        .order_by(MemberTimeline.created_at.desc())
        .limit(limit)
    )
    return list(rows)
