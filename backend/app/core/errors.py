from __future__ import annotations

from typing import Any

from fastapi import HTTPException, status


class AppError(Exception):
    """Base domain error carrying a stable machine-readable code."""

    code: str = "APP_ERROR"
    http_status: int = status.HTTP_400_BAD_REQUEST
    message: str = "Request failed"
    details: dict[str, Any] | list[Any] | None = None

    def __init__(
        self,
        message: str | None = None,
        *,
        code: str | None = None,
        details: dict[str, Any] | list[Any] | None = None,
        http_status: int | None = None,
    ) -> None:
        if message is not None:
            self.message = message
        if code is not None:
            self.code = code
        if details is not None:
            self.details = details
        if http_status is not None:
            self.http_status = http_status
        super().__init__(self.message)


class ValidationError(AppError):
    code = "VALIDATION"
    http_status = status.HTTP_422_UNPROCESSABLE_CONTENT


class ConflictError(AppError):
    code = "CONFLICT"
    http_status = status.HTTP_409_CONFLICT


class NotFoundError(AppError):
    code = "NOT_FOUND"
    http_status = status.HTTP_404_NOT_FOUND


class ForbiddenError(AppError):
    code = "INSUFFICIENT_PERMISSION"
    http_status = status.HTTP_403_FORBIDDEN


class UnauthenticatedError(AppError):
    code = "UNAUTHENTICATED"
    http_status = status.HTTP_401_UNAUTHORIZED


class RateLimitedError(AppError):
    code = "RATE_LIMITED"
    http_status = status.HTTP_429_TOO_MANY_REQUESTS


class TenantMismatchError(AppError):
    code = "TENANT_MISMATCH"
    http_status = status.HTTP_404_NOT_FOUND


def to_http_exception(exc: AppError) -> HTTPException:
    return HTTPException(
        status_code=exc.http_status,
        detail={
            "error": {
                "code": exc.code,
                "message": exc.message,
                "details": exc.details,
            }
        },
    )
