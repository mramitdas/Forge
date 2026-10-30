"""Unit tests for the in-memory auth rate limiter."""

from app.core.ratelimit import SlidingWindowLimiter


def test_allows_up_to_limit() -> None:
    limiter = SlidingWindowLimiter()
    assert all(limiter.allow("user-a", 3, 60) for _ in range(3))
    assert limiter.allow("user-a", 3, 60) is False


def test_windows_expire() -> None:
    limiter = SlidingWindowLimiter()
    assert all(limiter.allow("user-b", 1, 60) for _ in range(1))
    assert limiter.allow("user-b", 1, 60) is False
    limiter.reset()
    assert limiter.allow("user-b", 1, 60) is True


def test_limit_zero_means_disabled() -> None:
    limiter = SlidingWindowLimiter()
    assert all(limiter.allow("user-c", 0, 60) for _ in range(100))
