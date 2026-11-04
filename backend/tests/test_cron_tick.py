"""The scheduled-tick endpoint keeps background jobs alive on serverless."""

from __future__ import annotations

import pytest
from app.core.config import get_settings
from app.kernel.cron import _secret_ok

from tests.test_event_dispatch import _add_event, _fetch

TEST_SECRET = "cron-test-secret"


@pytest.fixture
def cron_secret(monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "cron_secret", TEST_SECRET)
    return TEST_SECRET


def test_secret_comparison():
    settings = type(get_settings())(cron_secret=TEST_SECRET, environment="development")
    assert _secret_ok(settings, None, None) is False
    assert _secret_ok(
        type(settings)(cron_secret=TEST_SECRET, environment="development"),
        None,
        TEST_SECRET,
    )
    assert not _secret_ok(
        type(settings)(cron_secret=TEST_SECRET, environment="development"),
        None,
        "wrong-secret",
    )
    assert not _secret_ok(
        type(settings)(cron_secret="", environment="development"), None, "anything"
    )


async def test_tick_requires_secret(client):
    assert (await client.get("/api/v1/system/jobs/tick")).status_code == 403

    wrong = await client.get(
        "/api/v1/system/jobs/tick", headers={"X-Cron-Secret": "wrong-secret"}
    )
    assert wrong.status_code == 403

    bearer = await client.get(
        "/api/v1/system/jobs/tick", headers={"Authorization": "Bearer wrong-secret"}
    )
    assert bearer.status_code == 403


async def test_tick_with_secret_delivers_a_pending_event(client, cron_secret):
    event = await _add_event(tenant_id=None, event_type="test.cron.noop")

    tick = await client.get(
        "/api/v1/system/jobs/tick", headers={"X-Cron-Secret": cron_secret}
    )
    assert tick.status_code == 200, tick.text
    assert "outbox_delivered" in tick.json() and "renewals_processed" in tick.json()

    row = await _fetch(event.id)
    assert row.published_at is not None


async def test_tick_with_bearer_secret(client, cron_secret):
    tick = await client.get(
        "/api/v1/system/jobs/tick", headers={"Authorization": f"Bearer {cron_secret}"}
    )
    assert tick.status_code == 200, tick.text
