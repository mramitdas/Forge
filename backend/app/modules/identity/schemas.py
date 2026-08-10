from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field, field_validator


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class RefreshRequest(BaseModel):
    refresh_token: str = Field(min_length=32, max_length=512)


class LogoutRequest(BaseModel):
    refresh_token: str = Field(min_length=32, max_length=512)


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"  # noqa: S105 -- JWT token_type claim name, not a secret
    expires_in: int


class UserOut(BaseModel):
    id: uuid.UUID
    email: EmailStr
    full_name: str
    phone: str | None
    is_active: bool
    is_platform: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class RoleOut(BaseModel):
    id: uuid.UUID
    name: str
    description: str | None
    is_system: bool
    is_editable: bool
    permission_codes: list[str] = []

    model_config = {"from_attributes": True}


class PermissionOut(BaseModel):
    code: str
    module: str
    description: str

    model_config = {"from_attributes": True}


class MeOut(BaseModel):
    user: UserOut
    tenant_id: uuid.UUID
    tenant_name: str | None = None
    is_platform: bool
    permissions: list[str]
    branches: list[dict] = []


class CreateEmployeeRequest(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=1, max_length=200)
    phone: str | None = None
    password: str = Field(min_length=8, max_length=128)
    role_ids: list[uuid.UUID] = []

    @field_validator("full_name")
    @classmethod
    def normalize_name(cls, v: str) -> str:
        return v.strip()


class CreateRoleRequest(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    description: str | None = None
    permission_codes: list[str] = Field(default_factory=list)
    branch_scope: str = "all"

    @field_validator("branch_scope")
    @classmethod
    def validate_scope(cls, v: str) -> str:
        if v not in {"all", "list"}:
            raise ValueError("branch_scope must be 'all' or 'list'")
        return v


class AssignRoleRequest(BaseModel):
    user_id: uuid.UUID
    role_id: uuid.UUID


class UpdateRoleRequest(BaseModel):
    description: str | None = None
    permission_codes: list[str] = Field(default_factory=list)
