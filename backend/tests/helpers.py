from __future__ import annotations

from httpx import AsyncClient


async def provision_gym(
    client: AsyncClient, token: str, slug: str, tier_code: str = "starter"
) -> dict:
    response = await client.post(
        "/api/v1/platform/gyms",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "name": f"Gym {slug}",
            "slug": slug,
            "owner_email": f"owner-{slug}@example.com",
            "owner_name": f"Owner {slug}",
            "owner_password": "owner-pass-123",
            "tier_code": tier_code,
            "timezone": "Asia/Kolkata",
            "currency": "INR",
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


async def login(client: AsyncClient, email: str, password: str) -> dict:
    response = await client.post(
        "/api/v1/auth/login", json={"email": email, "password": password}
    )
    assert response.status_code == 200, response.text
    return response.json()
