from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class PlanCreate(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    slug: str = Field(min_length=2, max_length=80, pattern=r"^[a-z0-9-]+$")
    branch_id: uuid.UUID | None = None
    description: str | None = None
    billing_period: str = "monthly"
    amount_minor: int = Field(ge=0)
    entry_fee_minor: int = Field(default=0, ge=0)
    tax_rate_bp: int = Field(default=1800, ge=0, le=10000)
    duration_months: int | None = Field(default=None, ge=1)
    auto_renew: bool = True


class PlanUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    branch_id: uuid.UUID | None = None
    description: str | None = None
    billing_period: str | None = None
    amount_minor: int | None = Field(default=None, ge=0)
    entry_fee_minor: int | None = Field(default=None, ge=0)
    tax_rate_bp: int | None = Field(default=None, ge=0, le=10000)
    duration_months: int | None = Field(default=None, ge=1)
    auto_renew: bool | None = None
    is_active: bool | None = None


class PlanOut(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    branch_id: uuid.UUID | None
    description: str | None
    billing_period: str
    amount_minor: int
    entry_fee_minor: int
    tax_rate_bp: int
    duration_months: int | None
    auto_renew: bool
    is_active: bool

    model_config = {"from_attributes": True}


class SubscriptionCreate(BaseModel):
    member_id: uuid.UUID
    plan_id: uuid.UUID
    branch_id: uuid.UUID
    start_at: datetime | None = None


class RenewBody(BaseModel):
    start_at: datetime | None = None


class SubscriptionOut(BaseModel):
    id: uuid.UUID
    member_id: uuid.UUID
    plan_id: uuid.UUID
    branch_id: uuid.UUID
    status: str
    start_at: datetime
    end_at: datetime | None
    auto_renew: bool
    price_minor: int
    currency: str

    model_config = {"from_attributes": True}
