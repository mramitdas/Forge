from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ValidationError
from app.kernel.events import bus
from app.kernel.pagination import OffsetPagination
from app.modules.attendance.models import CHECKIN_RESULTS, CHECKIN_SOURCES, CheckIn
from app.modules.membership.service import get_active_subscription
from app.modules.tenancy.models import Gym


class CheckInCreate(BaseModel):
    member_id: uuid.UUID
    branch_id: uuid.UUID
    source: str = "manual"
    device_id: str | None = None


class CheckInOut(BaseModel):
    id: uuid.UUID
    member_id: uuid.UUID
    branch_id: uuid.UUID
    recorded_at: datetime
    source: str
    result: str
    reason: str | None

    model_config = {"from_attributes": True}


@dataclass(slots=True)
class CheckInResult:
    check_in: CheckIn
    allowed: bool


async def check_in(
    session: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    member_id: uuid.UUID,
    branch_id: uuid.UUID,
    source: str = "manual",
    device_id: str | None = None,
) -> CheckInResult:
    if source not in CHECKIN_SOURCES:
        raise ValidationError("Invalid check-in source", code="INVALID_SOURCE")

    # Duplicate guard: no more than one check-in per member per branch in 60s.
    window_start = datetime.now(UTC) - timedelta(seconds=60)
    dup = await session.execute(
        select(CheckIn.id).where(
            CheckIn.tenant_id == tenant_id,
            CheckIn.member_id == member_id,
            CheckIn.branch_id == branch_id,
            CheckIn.recorded_at >= window_start,
        )
    )
    if dup.first() is not None:
        checkin = CheckIn(
            tenant_id=tenant_id,
            member_id=member_id,
            branch_id=branch_id,
            source=source,
            device_id=device_id,
            result="duplicate",
            reason="recent check-in exists",
        )
        session.add(checkin)
        await session.flush()
        return CheckInResult(check_in=checkin, allowed=False)

    sub = await get_active_subscription(session, member_id)
    if sub is None:
        checkin = CheckIn(
            tenant_id=tenant_id,
            member_id=member_id,
            branch_id=branch_id,
            source=source,
            device_id=device_id,
            result="denied",
            reason="no active membership",
        )
        session.add(checkin)
        await session.flush()
        await bus.emit(
            session,
            tenant_id=tenant_id,
            aggregate_type="member",
            aggregate_id=member_id,
            event_type="attendance.checkin.denied",
            payload={"member_id": str(member_id), "reason": "no active membership"},
        )
        return CheckInResult(check_in=checkin, allowed=False)

    cross_branch = False
    gym = await session.get(Gym, tenant_id)
    if gym is not None:
        cross_branch = gym.cross_branch_access
    if sub.branch_id != branch_id and not cross_branch:
        # Memberships are branch-scoped by default; a gym may enable
        # cross-branch access so members can train at any branch.
        checkin = CheckIn(
            tenant_id=tenant_id,
            member_id=member_id,
            branch_id=branch_id,
            source=source,
            device_id=device_id,
            result="denied",
            reason="membership is scoped to another branch",
        )
        session.add(checkin)
        await session.flush()
        return CheckInResult(check_in=checkin, allowed=False)

    checkin = CheckIn(
        tenant_id=tenant_id,
        member_id=member_id,
        branch_id=branch_id,
        source=source,
        device_id=device_id,
        result="allowed",
    )
    session.add(checkin)
    await session.flush()
    await bus.emit(
        session,
        tenant_id=tenant_id,
        aggregate_type="member",
        aggregate_id=member_id,
        event_type="attendance.checkin.recorded",
        payload={"member_id": str(member_id), "branch_id": str(branch_id)},
    )
    return CheckInResult(check_in=checkin, allowed=True)


async def list_check_ins(
    session: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    pagination: OffsetPagination,
    member_id: uuid.UUID | None = None,
    branch_id: uuid.UUID | None = None,
    result: str | None = None,
) -> tuple[list[CheckIn], int]:
    stmt = select(CheckIn).where(CheckIn.tenant_id == tenant_id)
    if member_id:
        stmt = stmt.where(CheckIn.member_id == member_id)
    if branch_id:
        stmt = stmt.where(CheckIn.branch_id == branch_id)
    if result:
        if result not in CHECKIN_RESULTS:
            raise ValidationError("Invalid result filter", code="INVALID_FILTER")
        stmt = stmt.where(CheckIn.result == result)
    total = await session.scalar(select(func.count()).select_from(stmt.subquery()))
    rows = (
        await session.execute(
            stmt.order_by(CheckIn.recorded_at.desc())
            .offset(pagination.offset())
            .limit(pagination.page_size)
        )
    ).scalars().all()
    return list(rows), total or 0
