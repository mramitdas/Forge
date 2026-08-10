from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import NotFoundError
from app.deps import Actor, get_session_for_actor, require_permission
from app.modules.notifications.service import (
    NotificationOut,
    list_for_user,
    mark_read,
    unread_count,
)

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("", response_model=list[NotificationOut])
async def list_notifications(
    actor: Annotated[Actor, Depends(require_permission("notifications.view"))],
    session: Annotated[AsyncSession, Depends(get_session_for_actor)],
) -> list[NotificationOut]:
    rows = await list_for_user(session, user_id=actor.user_id)
    return [NotificationOut.model_validate(n) for n in rows]


@router.get("/unread-count", response_model=dict)
async def unread(
    actor: Annotated[Actor, Depends(require_permission("notifications.view"))],
    session: Annotated[AsyncSession, Depends(get_session_for_actor)],
) -> dict:
    count = await unread_count(session, user_id=actor.user_id)
    return {"count": count}


@router.post("/{notification_id}/read", response_model=NotificationOut)
async def read(
    notification_id: uuid.UUID,
    actor: Annotated[Actor, Depends(require_permission("notifications.view"))],
    session: Annotated[AsyncSession, Depends(get_session_for_actor)],
) -> NotificationOut:
    notification = await mark_read(session, notification_id=notification_id)
    if notification is None or notification.user_id != actor.user_id:
        raise NotFoundError("Notification not found", code="NOT_FOUND")
    return NotificationOut.model_validate(notification)
