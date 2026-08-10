"""Payment provider abstraction.

Business code depends only on this interface. A concrete adapter (MockGateway for
development; RazorpayGateway for production) is selected at runtime, so switching or
adding providers never touches domain logic. The same seam allows later gateways
(Stripe, PayU) without code changes.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol


@dataclass(frozen=True, slots=True)
class PaymentRequest:
    amount_minor: int
    currency: str
    method: str
    description: str
    idempotency_key: str
    metadata: dict = field(default_factory=dict)


@dataclass(frozen=True, slots=True)
class PaymentResult:
    status: str  # succeeded | failed
    gateway_ref: str | None
    raw: dict


class GatewayAdapter(Protocol):
    async def capture(self, request: PaymentRequest) -> PaymentResult: ...


class MockGateway:
    """Deterministic in-process gateway for development and tests."""

    name = "mock"

    async def capture(self, request: PaymentRequest) -> PaymentResult:
        force_failure = request.metadata.get("force_failure", False)
        if force_failure or request.method == "cash_fail":
            return PaymentResult(
                status="failed",
                gateway_ref=None,
                raw={"code": "card_declined", "message": "insufficient funds"},
            )
        return PaymentResult(
            status="succeeded",
            gateway_ref=f"mock_pay_{request.idempotency_key[:16]}",
            raw={"authorized": True, "amount_minor": request.amount_minor},
        )


class RazorpayGateway:
    """Razorpay adapter.

    Not wired to live credentials in this scaffold. Implements the same contract as
    MockGateway: create an order, capture payment with the payment id + signature,
    and map webhook/signature results into PaymentResult. Credentials come from
    GYM_RAZORPAY_KEY_ID / GYM_RAZORPAY_KEY_SECRET and are never stored in code.
    """

    name = "razorpay"

    async def capture(self, request: PaymentRequest) -> PaymentResult:
        # Placeholder: full adapter requires credentials and is behind the same
        # interface. See docs/GYM_ERP_ARCHITECTURE.md §15.2 for the port/adapter rule.
        raise NotImplementedError("RazorpayGateway requires configured credentials")


def get_gateway() -> GatewayAdapter:
    return MockGateway()
