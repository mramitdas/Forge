"""Money is stored as integer minor units with an ISO currency.

This avoids float drift and `NUMERIC` ambiguity in high-volume arithmetic.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class Money:
    amount_minor: int
    currency: str = "INR"

    def __post_init__(self) -> None:
        if self.amount_minor < 0:
            raise ValueError("amount_minor must be >= 0")

    def to_major(self, decimals: int = 2) -> float:
        return self.amount_minor / (10**decimals)

    def __add__(self, other: Money) -> Money:
        self._check_currency(other)
        return Money(self.amount_minor + other.amount_minor, self.currency)

    def __sub__(self, other: Money) -> Money:
        self._check_currency(other)
        return Money(self.amount_minor - other.amount_minor, self.currency)

    def _check_currency(self, other: Money) -> None:
        if self.currency != other.currency:
            raise ValueError("currency mismatch")
