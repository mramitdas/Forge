from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class InvoiceOut(BaseModel):
    id: uuid.UUID
    number: str
    member_id: uuid.UUID
    branch_id: uuid.UUID
    subscription_id: uuid.UUID | None
    status: str
    issue_date: datetime
    due_date: datetime
    currency: str
    subtotal_minor: int
    tax_minor: int
    total_minor: int
    paid_minor: int
    lines: list[InvoiceLineOut] = []

    model_config = {"from_attributes": True}


class InvoiceLineOut(BaseModel):
    id: uuid.UUID
    description: str
    quantity: int
    unit_price_minor: int
    tax_rate_bp: int
    amount_minor: int
    kind: str

    model_config = {"from_attributes": True}


class InvoicePage(BaseModel):
    items: list[InvoiceOut]
    total: int
    page: int
    page_size: int


class InvoiceSummaryOut(BaseModel):
    outstanding_minor: int
    collected_minor: int
    overdue_minor: int
    monthly: dict[str, int] = {}


class PaymentCapture(BaseModel):
    method: str = Field(pattern=r"^(card|upi|netbanking|cash|credit|wallet)$")
    idempotency_key: str = Field(min_length=8, max_length=128)


class PaymentOut(BaseModel):
    id: uuid.UUID
    invoice_id: uuid.UUID
    amount_minor: int
    currency: str
    method: str
    status: str
    gateway: str
    gateway_ref: str | None
    paid_at: datetime | None
    failure_reason: str | None

    model_config = {"from_attributes": True}


class PaymentCaptureResult(BaseModel):
    payment: PaymentOut
    invoice: InvoiceOut
    idempotent_replay: bool = False
