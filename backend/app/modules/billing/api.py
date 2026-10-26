from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import Actor, get_session_for_actor, require_permission
from app.modules.billing import service as billing_svc
from app.modules.billing.schemas import (
    InvoiceOut,
    InvoicePage,
    InvoiceSummaryOut,
    PaymentCapture,
    PaymentCaptureResult,
    PaymentOut,
)

router = APIRouter(prefix="/invoices", tags=["billing"])


@router.get("", response_model=InvoicePage)
async def list_invoices(
    actor: Annotated[Actor, Depends(require_permission("billing.invoices.view"))],
    session: Annotated[AsyncSession, Depends(get_session_for_actor)],
    member_id: Annotated[uuid.UUID | None, Query()] = None,
    q: Annotated[str | None, Query()] = None,
    year: Annotated[int | None, Query(ge=1970, le=9999)] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=200)] = 50,
) -> InvoicePage:
    invoices, total = await billing_svc.list_invoices(
        session,
        tenant_id=actor.tenant_id,
        member_id=member_id,
        q=q,
        year=year,
        page=page,
        page_size=page_size,
    )
    out: list[InvoiceOut] = []
    for inv in invoices:
        loaded = await billing_svc.get_invoice(session, inv.id)
        out.append(InvoiceOut.model_validate(loaded))
    return InvoicePage(items=out, total=total, page=page, page_size=page_size)


@router.get("/summary", response_model=InvoiceSummaryOut)
async def invoice_summary(
    actor: Annotated[Actor, Depends(require_permission("billing.invoices.view"))],
    session: Annotated[AsyncSession, Depends(get_session_for_actor)],
    year: Annotated[int | None, Query(ge=1970, le=9999)] = None,
) -> InvoiceSummaryOut:
    summary = await billing_svc.invoice_summary(
        session, tenant_id=actor.tenant_id, year=year
    )
    return InvoiceSummaryOut(**summary)


@router.get("/{invoice_id}", response_model=InvoiceOut)
async def invoice_detail(
    invoice_id: uuid.UUID,
    actor: Annotated[Actor, Depends(require_permission("billing.invoices.view"))],
    session: Annotated[AsyncSession, Depends(get_session_for_actor)],
) -> InvoiceOut:
    invoice = await billing_svc.get_invoice(session, invoice_id)
    return InvoiceOut.model_validate(invoice)


@router.post("/{invoice_id}/pay", response_model=PaymentCaptureResult)
async def capture(
    invoice_id: uuid.UUID,
    body: PaymentCapture,
    actor: Annotated[Actor, Depends(require_permission("billing.payments.capture"))],
    session: Annotated[AsyncSession, Depends(get_session_for_actor)],
) -> PaymentCaptureResult:
    payment, invoice, replayed = await billing_svc.capture_payment(
        session,
        tenant_id=actor.tenant_id,
        invoice_id=invoice_id,
        method=body.method,
        idempotency_key=body.idempotency_key,
        member_id=None,
    )
    loaded = await billing_svc.get_invoice(session, invoice.id)
    return PaymentCaptureResult(
        payment=PaymentOut.model_validate(payment),
        invoice=InvoiceOut.model_validate(loaded),
        idempotent_replay=replayed,
    )


@router.post("/{invoice_id}/void", response_model=InvoiceOut)
async def void(
    invoice_id: uuid.UUID,
    actor: Annotated[Actor, Depends(require_permission("billing.invoices.view"))],
    session: Annotated[AsyncSession, Depends(get_session_for_actor)],
) -> InvoiceOut:
    invoice = await billing_svc.void_invoice(
        session, tenant_id=actor.tenant_id, invoice_id=invoice_id
    )
    return InvoiceOut.model_validate(invoice)
