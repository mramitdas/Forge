"""In-memory, per-process rate limiting for unauthenticated auth endpoints.

The API runs as a single process per instance (uvicorn locally, a serverless
function in production), so a module-level sliding window is enough to blunt
credential-stuffing and refresh-token brute force without external state.
Limits are per client IP and reset on redeploy.
"""

from __future__ import annotations

import time
from collections import deque
from threading import Lock

from app.core.errors import RateLimitedError


class SlidingWindowLimiter:
    def __init__(self) -> None:
        self._hits: dict[str, deque[float]] = {}
        self._lock = Lock()

    def allow(self, key: str, limit: int, window_seconds: float) -> bool:
        if limit <= 0:
            return True
        now = time.monotonic()
        cutoff = now - window_seconds
        with self._lock:
            hits = self._hits.setdefault(key, deque())
            while hits and hits[0] <= cutoff:
                hits.popleft()
            if len(hits) >= limit:
                return False
            hits.append(now)
            if len(self._hits) > 10_000:
                self._prune(cutoff)
            return True

    def _prune(self, cutoff: float) -> None:
        for key in [k for k, v in self._hits.items() if not v or v[-1] <= cutoff]:
            del self._hits[key]

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()


auth_limiter = SlidingWindowLimiter()


def client_ip(request) -> str:
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def enforce_auth_limit(request, scope: str, limit: int, window_seconds: float = 60) -> None:
    if not auth_limiter.allow(f"{scope}:{client_ip(request)}", limit, window_seconds):
        raise RateLimitedError("Too many attempts, try again shortly")
