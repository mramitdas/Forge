from __future__ import annotations

import re
import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field, field_validator

# Phone: digits only, optional leading +, 6-15 digits after stripping spaces.
_BRANCH_PHONE_RE = re.compile(r"^\+?\d{6,15}$")
# GSTIN: 2-digit state + 5 letters + 4 digits + entity letter + entity num + Z + checksum.
_BRANCH_GSTIN_RE = re.compile(r"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$")


class ProvisionGymRequest(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    slug: str = Field(min_length=2, max_length=80, pattern=r"^[a-z0-9-]+$")
    owner_email: EmailStr
    owner_name: str = Field(min_length=1, max_length=200)
    owner_password: str = Field(min_length=8, max_length=128)
    tier_code: str = "starter"
    timezone: str = "Asia/Kolkata"
    currency: str = "INR"


class GymOut(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    status: str
    tier_code: str
    timezone: str
    currency: str
    cross_branch_access: bool = False
    created_at: datetime
    deleted_at: datetime | None = None

    model_config = {"from_attributes": True}


class GymSettingsUpdate(BaseModel):
    # All fields optional: PATCH is partial, omitted fields stay unchanged.
    cross_branch_access: bool | None = None
    name: str | None = Field(default=None, min_length=2, max_length=200)
    timezone: str | None = Field(default=None, max_length=64)

    @field_validator("name", mode="before")
    @classmethod
    def normalize_name(cls, v: object) -> object:
        return v.strip() if isinstance(v, str) else v


class GymSettingsOut(BaseModel):
    name: str
    timezone: str
    currency: str
    cross_branch_access: bool = False


class TenantTierOut(BaseModel):
    tier_code: str
    tier_name: str
    description: str | None = None
    price_minor: int | None = None
    max_branches: int | None = None
    max_members: int | None = None
    branches_used: int
    members_used: int
    gym_status: str


class GymUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=200)
    timezone: str | None = Field(default=None, max_length=64)
    currency: str | None = Field(default=None, min_length=3, max_length=3)
    status: str | None = None
    tier_code: str | None = None
    cross_branch_access: bool | None = None


class GymOwnerOut(BaseModel):
    id: uuid.UUID
    email: str
    full_name: str
    is_active: bool
    gym_id: uuid.UUID
    gym_name: str
    gym_status: str
    gym_tier: str
    created_at: datetime | None = None


class OwnerUpdateRequest(BaseModel):
    full_name: str | None = Field(default=None, min_length=1, max_length=200)
    email: EmailStr | None = None
    password: str | None = Field(default=None, min_length=8, max_length=128)
    is_active: bool | None = None


class SubscriptionTierOut(BaseModel):
    code: str
    name: str
    description: str | None = None
    price_minor: int | None = None
    max_branches: int | None
    max_members: int | None
    limits: dict
    is_active: bool = True

    model_config = {"from_attributes": True}


class SubscriptionTierCreate(BaseModel):
    code: str = Field(min_length=1, max_length=40, pattern=r"^[a-z0-9-]+$")
    name: str = Field(min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=500)
    price_minor: int | None = Field(default=None, ge=0)
    max_branches: int | None = Field(default=None, ge=1)
    max_members: int | None = Field(default=None, ge=1)
    limits: dict = Field(default_factory=dict)


class SubscriptionTierUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=500)
    price_minor: int | None = Field(default=None, ge=0)
    max_branches: int | None = Field(default=None, ge=1)
    max_members: int | None = Field(default=None, ge=1)
    limits: dict | None = None
    is_active: bool | None = None


class SubscriptionEventOut(BaseModel):
    id: uuid.UUID
    gym_id: uuid.UUID
    gym_name: str
    actor_email: str | None
    event_type: str
    from_tier_code: str | None
    to_tier_code: str
    created_at: datetime


class RevenuePointOut(BaseModel):
    month: str
    revenue_minor: int
    subscriptions_sold: int


class SoldSubscriptionOut(BaseModel):
    id: uuid.UUID
    member_name: str
    plan_name: str
    gym_name: str
    branch_name: str
    status: str
    price_minor: int
    currency: str
    start_at: datetime


class PlatformRevenueOut(BaseModel):
    series: list[RevenuePointOut]
    sold: list[SoldSubscriptionOut]
    total_minor: int


class SubscriptionUpdateRequest(BaseModel):
    tier_code: str = Field(min_length=1, max_length=40)


class RestoreGymRequest(BaseModel):
    tier_code: str | None = Field(default=None, min_length=1, max_length=40)


class PlatformSummaryOut(BaseModel):
    gyms_total: int
    gyms_trial: int
    gyms_active: int
    gyms_suspended: int
    owners_total: int
    active_subscriptions: int
    mrr_minor: int


class GymSubscriptionOut(BaseModel):
    gym_id: uuid.UUID
    gym_name: str
    gym_status: str
    tier_code: str
    tier_name: str
    max_branches: int | None
    max_members: int | None
    members_count: int
    active_subscriptions: int


class _BranchFieldValidators(BaseModel):
    """Shared strip/normalise/format checks for branch code, phone, and GST."""

    @field_validator("code", mode="before", check_fields=False)
    @classmethod
    def _strip_code(cls, v: object) -> object:
        if isinstance(v, str):
            v = v.strip()
            return v or None
        return v

    @field_validator("code", check_fields=False)
    @classmethod
    def _code_length(cls, v: str | None) -> str | None:
        if v is not None and len(v) > 32:
            raise ValueError("must be at most 32 characters")
        return v

    @field_validator("phone", mode="before", check_fields=False)
    @classmethod
    def _strip_phone(cls, v: object) -> object:
        if isinstance(v, str):
            v = v.strip().replace(" ", "")
            return v or None
        return v

    @field_validator("phone", check_fields=False)
    @classmethod
    def _phone_format(cls, v: str | None) -> str | None:
        if v is not None and not _BRANCH_PHONE_RE.match(v):
            raise ValueError("must be 6-15 digits with an optional leading +")
        return v

    @field_validator("gst_number", mode="before", check_fields=False)
    @classmethod
    def _norm_gst(cls, v: object) -> object:
        if isinstance(v, str):
            v = v.strip().upper()
            return v or None
        return v

    @field_validator("gst_number", check_fields=False)
    @classmethod
    def _gst_format(cls, v: str | None) -> str | None:
        if v is not None and not _BRANCH_GSTIN_RE.match(v):
            raise ValueError("must be a valid 15-character GSTIN")
        return v


class BranchCreate(_BranchFieldValidators):
    name: str = Field(min_length=1, max_length=200)
    code: str | None = Field(default=None, max_length=32)
    address: str | None = None
    phone: str | None = None
    country_code: str | None = None
    gst_number: str | None = None
    timezone: str = "Asia/Kolkata"


class BranchUpdate(_BranchFieldValidators):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    code: str | None = Field(default=None, max_length=32)
    address: str | None = None
    phone: str | None = None
    country_code: str | None = None
    gst_number: str | None = None
    timezone: str | None = Field(default=None, max_length=64)
    is_active: bool | None = None


class BranchOut(BaseModel):
    id: uuid.UUID
    gym_id: uuid.UUID
    name: str
    code: str | None
    address: str | None
    phone: str | None
    country_code: str | None
    gst_number: str | None
    timezone: str
    is_active: bool

    model_config = {"from_attributes": True}
