"""Tests for the multi-instance outbox dispatcher: shard partitioning, leases, poison pill."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from app.core.config import get_settings
from app.db.session import get_sessionmaker
from app.kernel.events import Dispatcher, OutboxEvent, bus
from sqlalchemy import text


async def _shard_of(aggregate_id: uuid.UUID, shard_count: int) -> int:
    """Shard assignment exactly as the dispatcher's claim query computes it."""
    maker = get_sessionmaker()
    async with maker() as session:
        result = await session.execute(
            text("SELECT mod(abs(hashtext(CAST(:aid AS text))), :n) AS shard"),
            {"aid": str(aggregate_id), "n": shard_count},
        )
        return int(result.scalar_one())


async def test_shard_assignment_covers_each_event_exactly_once():
    """For any shard count, every aggregate id maps to exactly one in-range shard."""
    ids = [uuid.uuid4() for _ in range(64)]
    for count in (1, 2, 5):
        shards = [await _shard_of(aid, count) for aid in ids]
        assert all(0 <= s < count for s in shards), f"shard out of range for count={count}"
        # Partition property: paired with the claim filter, each event has
        # exactly one owning instance — no duplicate owner, no gap.
        assert set(shards) <= set(range(count))


async def test_shard_is_deterministic():
    """Same aggregate id always lands on the same shard for a fixed count."""
    ids = [uuid.uuid4() for _ in range(32)]
    for count in (2, 5):
        first = [await _shard_of(aid, count) for aid in ids]
        second = [await _shard_of(aid, count) for aid in ids]
        assert first == second


async def _add_event(**kwargs) -> OutboxEvent:
    maker = get_sessionmaker()
    simple = dict(
        aggregate_type=kwargs.pop("aggregate_type", "order"),
        aggregate_id=kwargs.pop("aggregate_id", uuid.uuid4()),
        event_type=kwargs.pop("event_type", "test.dispatch.noop"),
        payload=kwargs.pop("payload", {}),
    )
    async with maker() as session:
        await session.begin()
        event = OutboxEvent(**simple, **kwargs)
        session.add(event)
        await session.flush()
        await session.refresh(event)
        await session.commit()
        return event


async def _fetch(event_id: uuid.UUID) -> OutboxEvent:
    maker = get_sessionmaker()
    async with maker() as session:
        await session.begin()
        return await session.get(OutboxEvent, event_id)


async def _deliver_until(event_id: uuid.UUID, want_published: bool, max_cycles: int = 300) -> None:
    """Drain the shared outbox across other tests' leftover events until mind.

    The suite shares one DB, so other tests leave pending events behind; the
    dispatcher claims globally, never mind their presence — assert on this
    test's own event state instead of run_once's return count.
    """
    for _ in range(max_cycles):
        row = await _fetch(event_id)
        assert row is not None
        if (row.published_at is not None) == want_published:
            return
        await Dispatcher().run_once()
    raise AssertionError(f"event {event_id} never reached published={want_published}")


@pytest.fixture
async def _noop_handler():
    bus.register("test.dispatch.noop", _noop_delivery)

    yield

    # Drop only the test handler registration.
    bus._handlers["test.dispatch.noop"] = []


async def _noop_delivery(session, aggregate_type, aggregate_id, event_type, payload) -> None:
    return None


async def test_lease_blocks_reclaim_until_expiry(_noop_handler):
    """A freshly claimed event is invisible to other instances until the lease expires."""
    event = await _add_event(tenant_id=None)
    await _deliver_until(event.id, want_published=True)

    # Simulate another instance claiming an event mid-delivery: claimed but
    # not yet published. A second dispatcher must not pick it up.
    leased = await _add_event(tenant_id=None, claimed_at=datetime.now(UTC))
    await Dispatcher().run_once()
    row = await _fetch(leased.id)
    assert row.published_at is None

    # Once the lease lapses, the event becomes reclaimable and deliverable.
    maker = get_sessionmaker()
    async with maker() as session:
        await session.begin()
        stale = await session.get(OutboxEvent, leased.id)
        stale.claimed_at = datetime.now(UTC) - timedelta(
            seconds=get_settings().outbox_lease_seconds + 5
        )
        await session.commit()

    await _deliver_until(leased.id, want_published=True)


async def test_poison_cap_stops_delivery(_noop_handler):
    settings = get_settings()
    event = await _add_event(tenant_id=None, attempts=settings.outbox_max_deliveries)
    for _ in range(3):
        assert await Dispatcher().run_once() <= 100
        # Poison-pill cap: the event stays at the cap, never delivered again.
        row = await _fetch(event.id)
        assert row.published_at is None
        assert row.attempts == settings.outbox_max_deliveries


async def test_claim_bumps_attempts_up_to_cap(_noop_handler):
    settings = get_settings()
    event = await _add_event(tenant_id=None, attempts=settings.outbox_max_deliveries - 1)
    await _deliver_until(event.id, want_published=True)
    row = await _fetch(event.id)
    assert row.attempts == settings.outbox_max_deliveries

    # After a successful delivery the event is done: no re-claim.
    for _ in range(2):
        await Dispatcher().run_once()
        assert (await _fetch(event.id)).attempts == settings.outbox_max_deliveries
