from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ConflictError, NotFoundError, ValidationError
from app.kernel.events import bus
from app.modules.billing.gateway import PaymentRequest, get_gateway
from app.modules.billing.models import (
    PAYMENT_METHODS,
    Invoice,
    InvoiceLine,
    InvoiceSequence,
    Payment,
)
from app.modules.membership.models import Subscription


def _compute_tax(amount_minor: int, tax_rate_bp: int) -> int:
    """Tax in minor units rounded to nearest integer (half-up)."""
    return (amount_minor * tax_rate_bp + 5000) // 10000


async def _next_invoice_number(session: AsyncSession, tenant_id: uuid.UUID, now: datetime) -> str:
    year = now.year
    result = await session.execute(
        select(InvoiceSequence).where(
            InvoiceSequence.tenant_id == tenant_id, InvoiceSequence.year == year
        )
    )
    seq = result.scalar_one_or_none()
    if seq is None:
        seq = InvoiceSequence(tenant_id=tenant_id, year=year, last_number=0)
        session.add(seq)
        await session.flush()
    seq.last_number += 1
    await session.flush()
    return f"INV-{year}-{seq.last_number:06d}"


async def create_invoice_for_subscription(
    session: AsyncSession, sub: Subscription, *, entry_fee_minor: int = 0
) -> Invoice:
    now = datetime.now(UTC)
    subtotal = sub.price_minor + entry_fee_minor
    invoice = Invoice(
        tenant_id=sub.tenant_id,
        number=await _next_invoice_number(session, sub.tenant_id, now),
        member_id=sub.member_id,
        branch_id=sub.branch_id,
        subscription_id=sub.id,
        status="open",
        issue_date=now,
        due_date=now + timedelta(days=7),
        currency=sub.currency,
        subtotal_minor=subtotal,
        tax_minor=0,
        total_minor=0,
        paid_minor=0,
    )
    session.add(invoice)
    await session.flush()
    invoice.lines = [
        InvoiceLine(
            invoice_id=invoice.id,
            description="Membership subscription",
            quantity=1,
            unit_price_minor=sub.price_minor,
            tax_rate_bp=0,
            amount_minor=sub.price_minor,
            kind="membership",
        )
    ]
    if entry_fee_minor:
        invoice.lines.append(
            InvoiceLine(
                invoice_id=invoice.id,
                description="Entry fee",
                quantity=1,
                unit_price_minor=entry_fee_minor,
                tax_rate_bp=0,
                amount_minor=entry_fee_minor,
                kind="entry_fee",
            )
        )
    for line in invoice.lines:
        session.add(line)
    invoice.subtotal_minor = sum(line.amount_minor for line in invoice.lines)
    invoice.total_minor = invoice.subtotal_minor  # taxes applied at capture in this scaffold
    await session.flush()
    return invoice


async def get_invoice(session: AsyncSession, invoice_id: uuid.UUID) -> Invoice:
    invoice = await session.get(Invoice, invoice_id)
    if invoice is None or invoice.deleted_at is not None:
        raise NotFoundError("Invoice not found", code="NOT_FOUND")
    invoice.lines = list(
        (
            await session.execute(
                select(InvoiceLine)
                .where(InvoiceLine.invoice_id == invoice.id)
                .order_by(InvoiceLine.id)
            )
        ).scalars()
    )
    return invoice


async def list_invoices(
    session: AsyncSession, *, tenant_id: uuid.UUID, member_id: uuid.UUID | None = None
) -> list[Invoice]:
    stmt = select(Invoice).where(
        Invoice.tenant_id == tenant_id, Invoice.deleted_at.is_(None)
    )
    if member_id:
        stmt = stmt.where(Invoice.member_id == member_id)
    rows = await session.scalars(stmt.order_by(Invoice.issue_date.desc()))
    return list(rows)


async def capture_payment(
    session: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    invoice_id: uuid.UUID,
    method: str,
    idempotency_key: str,
    member_id: uuid.UUID | None = None,
) -> tuple[Payment, Invoice, bool]:
    if method not in PAYMENT_METHODS:
        raise ValidationError("Invalid payment method", code="INVALID_METHOD")

    invoice = await get_invoice(session, invoice_id)
    if invoice.tenant_id != tenant_id:
        raise NotFoundError("Invoice not found", code="NOT_FOUND")

    # Idempotency first: if this key already succeeded, replay the stored result
    # even when the invoice is now settled.
    existing = await session.execute(
        select(Payment).where(
            Payment.tenant_id == tenant_id,
            Payment.idempotency_key == idempotency_key,
            Payment.deleted_at.is_(None),
        )
    )
    prior = existing.scalar_one_or_none()
    if prior is not None and prior.status == "succeeded":
        return prior, invoice, True

    if invoice.status in ("paid", "void"):
        raise ConflictError("Invoice already settled", code="INVOICE_SETTLED")

    gateway = get_gateway()
    result = await gateway.capture(
        PaymentRequest(
            amount_minor=invoice.total_minor,
            currency=invoice.currency,
            method=method,
            description=f"Invoice {invoice.number}",
            idempotency_key=idempotency_key,
            metadata={"tenant_id": str(tenant_id), "invoice_id": str(invoice.id)},
        )
    )

    payment = Payment(
        tenant_id=tenant_id,
        invoice_id=invoice.id,
        member_id=member_id or invoice.member_id,
        amount_minor=invoice.total_minor,
        currency=invoice.currency,
        method=method,
        status=result.status,
        gateway=gateway.name,
        gateway_ref=result.gateway_ref,
        idempotency_key=idempotency_key,
        raw=result.raw,
        paid_at=datetime.now(UTC) if result.status == "succeeded" else None,
        failure_reason=None if result.status == "succeeded" else result.raw.get("message"),
    )
    session.add(payment)
    try:
        await session.flush()
    except IntegrityError:
        await session.rollback()
        raise ConflictError(
            "Duplicate idempotency key", code="DUPLICATE_IDEMPOTENCY_KEY"
        ) from None

    if result.status == "succeeded":
        invoice.status = "paid"
        invoice.paid_minor = invoice.total_minor
        await bus.emit(
            session,
            tenant_id=tenant_id,
            aggregate_type="payment",
            aggregate_id=payment.id,
            event_type="billing.payment.succeeded",
            payload={
                "payment_id": str(payment.id),
                "invoice_id": str(invoice.id),
                "member_id": str(payment.member_id),
                "amount_minor": payment.amount_minor,
                "currency": payment.currency,
            },
        )
    else:
        await bus.emit(
            session,
            tenant_id=tenant_id,
            aggregate_type="payment",
            aggregate_id=payment.id,
            event_type="billing.payment.failed",
            payload={
                "payment_id": str(payment.id),
                "invoice_id": str(invoice.id),
                "member_id": str(payment.member_id),
                "reason": payment.failure_reason,
            },
        )
    return payment, await get_invoice(session, invoice.id), False
