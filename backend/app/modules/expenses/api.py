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
    ExpenseUpdate,
    ExpenseYearOut,
    create_expense,
    delete_expense,
    list_expenses_by_year,
    update_expense,
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


@router.get("", response_model=ExpenseYearOut)
async def list_expenses_by_year_route(
    actor: Annotated[Actor, Depends(require_permission("expenses.view"))],
    session: Annotated[AsyncSession, Depends(get_session_for_actor)],
    year: int | None = Query(None, ge=1970, le=9999),
    page: int = Query(1, ge=1),
    page_size: int = Query(1000, ge=1, le=1000),
) -> ExpenseYearOut:
    pagination = OffsetPagination(page=page, page_size=page_size)
    return await list_expenses_by_year(
        session=session,
        tenant_id=actor.tenant_id,
        year=year or datetime.now().year,
        pagination=pagination,
    )


@router.patch("/{expense_id}", response_model=ExpenseOut)
async def update_expense_route(
    expense_id: uuid.UUID,
    body: ExpenseUpdate,
    actor: Annotated[Actor, Depends(require_permission("expenses.manage"))],
    session: Annotated[AsyncSession, Depends(get_session_for_actor)],
) -> ExpenseOut:
    expense = await update_expense(
        session,
        tenant_id=actor.tenant_id,
        expense_id=expense_id,
        data=body.model_dump(exclude_unset=True),
    )
    return ExpenseOut.model_validate(expense)


@router.delete("/{expense_id}", status_code=204)
async def delete_expense_route(
    expense_id: uuid.UUID,
    actor: Annotated[Actor, Depends(require_permission("expenses.manage"))],
    session: Annotated[AsyncSession, Depends(get_session_for_actor)],
) -> None:
    await delete_expense(session, tenant_id=actor.tenant_id, expense_id=expense_id)

