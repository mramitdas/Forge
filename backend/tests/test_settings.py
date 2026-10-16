from __future__ import annotations

from tests.helpers import login


async def test_gym_settings_partial_updates(client, gym_a):
    owner = await login(client, "owner-gyma@example.com", "owner-pass-123")
    headers = {"Authorization": f"Bearer {owner['access_token']}"}

    initial = await client.get("/api/v1/settings", headers=headers)
    assert initial.status_code == 200, initial.text
    original = initial.json()

    try:
        renamed = await client.patch(
            "/api/v1/settings",
            headers=headers,
            json={"name": "Gym A Renamed", "timezone": "Asia/Dubai"},
        )
        assert renamed.status_code == 200, renamed.text
        body = renamed.json()
        assert body["name"] == "Gym A Renamed"
        assert body["timezone"] == "Asia/Dubai"
        assert body["cross_branch_access"] == original["cross_branch_access"]

        # Partial PATCH (only cross_branch_access) must not reset name/timezone.
        partial = await client.patch(
            "/api/v1/settings", headers=headers, json={"cross_branch_access": True}
        )
        assert partial.status_code == 200, partial.text
        assert partial.json()["name"] == "Gym A Renamed"
        assert partial.json()["cross_branch_access"] is True

        # Short name is rejected.
        bad = await client.patch("/api/v1/settings", headers=headers, json={"name": "x"})
        assert bad.status_code == 422, bad.text

        # Whitespace-only name must fail validation (strip happens before min_length).
        blank = await client.patch("/api/v1/settings", headers=headers, json={"name": "  "})
        assert blank.status_code == 422, blank.text

        # Padded name is stripped before validation and on the way out.
        padded = await client.patch(
            "/api/v1/settings", headers=headers, json={"name": "  padded  "}
        )
        assert padded.status_code == 200, padded.text
        assert padded.json()["name"] == "padded"

        # Overlong timezone must be rejected (column is String(64)).
        overlong = await client.patch(
            "/api/v1/settings", headers=headers, json={"timezone": "x" * 65}
        )
        assert overlong.status_code == 422, overlong.text
    finally:
        # Restore gym_a for other tests sharing the fixture.
        restore = await client.patch(
            "/api/v1/settings",
            headers=headers,
            json={
                "name": original["name"],
                "timezone": original["timezone"],
                "cross_branch_access": original["cross_branch_access"],
            },
        )
        assert restore.status_code == 200, restore.text
        # GymSettingsOut has no volatile fields, so the full body must match.
        assert restore.json() == original
