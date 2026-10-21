from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import NotFoundError, ValidationError
from app.kernel.pagination import OffsetPagination
from app.modules.expenses.models import EXPENSE_METHODS, Expense


class ExpenseCreate(BaseModel):
    category: str
    description: str | None = None
    amount_minor: int
    method: str = "cash"
    branch_id: uuid.UUID | None = None
    paid_at: datetime | None = None


class ExpenseUpdate(BaseModel):
    category: str | None = None
    description: str | None = None
    amount_minor: int | None = None
    method: str | None = None
    branch_id: uuid.UUID | None = None
    paid_at: datetime | None = None


class ExpenseOut(BaseModel):
    id: uuid.UUID
    branch_id: uuid.UUID | None
    category: str
    description: str | None
    amount_minor: int
    currency: str
    method: str
    paid_at: datetime

    model_config = {"from_attributes": True}


async def create_expense(
    session: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    category: str,
    amount_minor: int,
    method: str,
    description: str | None = None,
    branch_id: uuid.UUID | None = None,
    paid_at: datetime | None = None,
) -> Expense:
    if not category.strip():
        raise ValidationError("Category is required", code="CATEGORY_REQUIRED")
    if amount_minor <= 0:
        raise ValidationError("Amount must be positive", code="INVALID_AMOUNT")
    if method not in EXPENSE_METHODS:
        raise ValidationError("Invalid payment method", code="INVALID_METHOD")
    expense = Expense(
        tenant_id=tenant_id,
        branch_id=branch_id,
        category=category.strip(),
        description=description,
        amount_minor=amount_minor,
        method=method,
        paid_at=paid_at or datetime.now().astimezone(),
    )
    session.add(expense)
    await session.flush()
    return expense


async def list_expenses(
    session: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    pagination: OffsetPagination,
    category: str | None = None,
    branch_id: uuid.UUID | None = None,
    paid_from: datetime | None = None,
    paid_to: datetime | None = None,
) -> tuple[list[Expense], int]:
    stmt = select(Expense).where(
        Expense.tenant_id == tenant_id, Expense.deleted_at.is_(None)
    )
    if category:
        stmt = stmt.where(Expense.category == category)
    if branch_id:
        stmt = stmt.where(Expense.branch_id == branch_id)
    if paid_from:
        stmt = stmt.where(Expense.paid_at >= paid_from)
    if paid_to:
        stmt = stmt.where(Expense.paid_at <= paid_to)
    total = await session.scalar(select(func.count()).select_from(stmt.subquery()))
    rows = (
        await session.execute(
            stmt.order_by(Expense.paid_at.desc(), Expense.id.desc())
            .offset(pagination.offset())
            .limit(pagination.page_size)
        )
    ).scalars().all()
    return list(rows), total or 0


async def update_expense(
    session: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    expense_id: uuid.UUID,
    data: dict,
) -> Expense:
    expense = await session.scalar(
        select(Expense).where(
            Expense.id == expense_id,
            Expense.tenant_id == tenant_id,
            Expense.deleted_at.is_(None),
        )
    )
    if expense is None:
        raise NotFoundError("Expense not found", code="NOT_FOUND")
    if "category" in data and data["category"] is not None:
        if not data["category"].strip():
            raise ValidationError("Category is required", code="CATEGORY_REQUIRED")
        expense.category = data["category"].strip()
    if "amount_minor" in data and data["amount_minor"] is not None:
        if data["amount_minor"] <= 0:
            raise ValidationError("Amount must be positive", code="INVALID_AMOUNT")
        expense.amount_minor = data["amount_minor"]
    if "method" in data and data["method"] is not None:
        if data["method"] not in EXPENSE_METHODS:
            raise ValidationError("Invalid payment method", code="INVALID_METHOD")
        expense.method = data["method"]
    if "description" in data:
        expense.description = data["description"]
    if "branch_id" in data:
        expense.branch_id = data["branch_id"]
    if "paid_at" in data and data["paid_at"] is not None:
        expense.paid_at = data["paid_at"]
    await session.flush()
    return expense


async def delete_expense(
    session: AsyncSession, *, tenant_id: uuid.UUID, expense_id: uuid.UUID
) -> None:
    expense = await session.scalar(
        select(Expense).where(
            Expense.id == expense_id,
            Expense.tenant_id == tenant_id,
            Expense.deleted_at.is_(None),
        )
    )
    if expense is None:
        raise NotFoundError("Expense not found", code="NOT_FOUND")
    expense.deleted_at = datetime.now().astimezone()
    await session.flush()
