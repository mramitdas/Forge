from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel, EmailStr, Field


class MemberCreate(BaseModel):
    first_name: str = Field(min_length=1, max_length=120)
    last_name: str | None = None
    email: EmailStr | None = None
    phone: str | None = None
    gender: str | None = None
    dob: date | None = None
    branch_id: uuid.UUID
    status: str = "lead"
    notes: str | None = None


class MemberUpdate(BaseModel):
    first_name: str | None = Field(default=None, min_length=1, max_length=120)
    last_name: str | None = None
    email: EmailStr | None = None
    phone: str | None = None
    gender: str | None = None
    dob: date | None = None
    status: str | None = None
    notes: str | None = None


class MemberOut(BaseModel):
    id: uuid.UUID
    branch_id: uuid.UUID
    first_name: str
    last_name: str | None
    full_name: str
    email: str | None
    phone: str | None
    gender: str | None
    status: str
    joined_at: datetime | None
    created_at: datetime
    version: int

    model_config = {"from_attributes": True}


class MemberTimelineOut(BaseModel):
    id: uuid.UUID
    action: str
    payload: dict
    actor_id: uuid.UUID | None
    created_at: datetime

    model_config = {"from_attributes": True}


class PageOut(BaseModel):
    items: list[MemberOut]
    total: int | None
    page: int
    page_size: int
