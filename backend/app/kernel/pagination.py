from __future__ import annotations

import base64
from dataclasses import dataclass
from typing import Any, Generic, TypeVar

T = TypeVar("T")


@dataclass(slots=True)
class Page(Generic[T]):
    items: list[T]
    total: int | None
    next_cursor: str | None = None


def encode_cursor(created_at: str, pk: str) -> str:
    raw = f"{created_at}:{pk}"
    return base64.urlsafe_b64encode(raw.encode()).decode()


def decode_cursor(cursor: str) -> tuple[str, str]:
    try:
        raw = base64.urlsafe_b64decode(cursor.encode()).decode()
    except Exception as exc:
        raise ValueError("invalid cursor") from exc
    parts = raw.split(":", 1)
    if len(parts) != 2:
        raise ValueError("invalid cursor")
    return parts[0], parts[1]


@dataclass(slots=True)
class OffsetPagination:
    page: int = 1
    page_size: int = 20

    def __post_init__(self) -> None:
        if self.page < 1:
            self.page = 1
        if not 1 <= self.page_size <= 100:
            self.page_size = 20

    def offset(self) -> int:
        return (self.page - 1) * self.page_size


def paginate_offset(
    items: list[Any], total: int | None, pagination: OffsetPagination
) -> Page[Any]:
    return Page(items=items, total=total)
