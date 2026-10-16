from __future__ import annotations

import uuid
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import Actor, get_session_for_actor, require_permission
from app.kernel.pagination import OffsetPagination
from app.modules.expenses.service import (
    ExpenseCreate,
    ExpenseOut,
    create_expense,
    delete_expense,
    list_expenses,
)

router = APIRouter(prefix="/expenses", tags=["expenses"])


@router.post("", response_model=ExpenseOut, status_code=201)
async def create_expense_route(
    body: ExpenseCreate,
    actor: Annotated[Actor, Depends(require_permission("expenses.manage"))],
    session: Annotated[AsyncSession, Depends(get_session_for_actor)],
) -> ExpenseOut:
    expense = await create_expense(
        session,
        tenant_id=actor.tenant_id,
        category=body.category,
        description=body.description,
        amount_minor=body.amount_minor,
        method=body.method,
        branch_id=body.branch_id,
        paid_at=body.paid_at,
    )
    return ExpenseOut.model_validate(expense)


@router.get("", response_model=dict)
async def list_expenses_route(
    actor: Annotated[Actor, Depends(require_permission("expenses.view"))],
    session: Annotated[AsyncSession, Depends(get_session_for_actor)],
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    category: str | None = None,
    branch_id: uuid.UUID | None = None,
    paid_from: datetime | None = None,
    paid_to: datetime | None = None,
) -> dict:
    pagination = OffsetPagination(page=page, page_size=page_size)
    rows, total = await list_expenses(
        session,
        tenant_id=actor.tenant_id,
        pagination=pagination,
        category=category,
        branch_id=branch_id,
        paid_from=paid_from,
        paid_to=paid_to,
    )
    return {
        "items": [ExpenseOut.model_validate(r).model_dump() for r in rows],
        "total": total,
        "page": pagination.page,
        "page_size": pagination.page_size,
    }


@router.delete("/{expense_id}", status_code=204)
async def delete_expense_route(
    expense_id: uuid.UUID,
    actor: Annotated[Actor, Depends(require_permission("expenses.manage"))],
    session: Annotated[AsyncSession, Depends(get_session_for_actor)],
) -> None:
    await delete_expense(session, tenant_id=actor.tenant_id, expense_id=expense_id)
