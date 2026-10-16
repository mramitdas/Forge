from __future__ import annotations

import os
import subprocess
import uuid
from pathlib import Path

import pytest

# Point the app at the test database BEFORE any app module is imported.
TEST_DB_URL = "postgresql+asyncpg://gym:gym_dev_pass@127.0.0.1:5432/gym_erp_test"
os.environ.setdefault("GYM_DATABASE_URL", TEST_DB_URL)
os.environ.setdefault("GYM_ENVIRONMENT", "test")
os.environ.setdefault("GYM_DEBUG", "true")

from app.core.config import get_settings  # noqa: E402
from app.core.security import create_access_token, hash_password  # noqa: E402
from app.core.tenant import TenantContext, reset_tenant_context, set_tenant_context  # noqa: E402
from app.db.session import get_sessionmaker  # noqa: E402
from app.kernel.events import Dispatcher  # noqa: E402
from app.main import create_app  # noqa: E402
from app.modules.identity.models import Credential, User, UserRole  # noqa: E402
from app.modules.identity.service import seed_platform_roles  # noqa: E402
from app.modules.notifications.service import register_handlers  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402

from tests.helpers import provision_gym  # noqa: E402

BACKEND_DIR = Path(__file__).resolve().parents[1]

# The schema reset needs a role that can DROP/CREATE the public schema. CI
# provisions `gym_admin` as a superuser; locally it may not exist yet, so fall
# back to the app role (`gym`), which owns the schema after the first reset.
_TEST_SYNC_URLS = (
    "postgresql://gym_admin:gym_admin_pass@127.0.0.1:5432/gym_erp_test",
    "postgresql://gym:gym_dev_pass@127.0.0.1:5432/gym_erp_test",
)


def _reset_test_schema() -> None:
    """Drop and recreate the public schema, handing ownership to `gym`."""
    import psycopg2

    last_exc: Exception | None = None
    for url in _TEST_SYNC_URLS:
        try:
            conn = psycopg2.connect(url)
        except psycopg2.OperationalError as exc:
            last_exc = exc
            continue
        conn.autocommit = True
        with conn.cursor() as cur:
            cur.execute("DROP SCHEMA public CASCADE")
            cur.execute("CREATE SCHEMA public")
            cur.execute("ALTER SCHEMA public OWNER TO gym")
            cur.execute("GRANT USAGE, CREATE ON SCHEMA public TO gym")
            cur.execute(
                "GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO gym"
            )
        conn.close()
        return
    raise RuntimeError(
        "Could not connect to the test database as gym_admin or gym. "
        "Start Postgres and ensure the `gym` role/database exist "
        "(see README Quickstart)."
    ) from last_exc


@pytest.fixture(scope="session", autouse=True)
def migrated_database():
    """Drop and rebuild the test schema once per session."""
    _reset_test_schema()
    # Run alembic against the test DB as the app role.
    env = dict(os.environ, GYM_DATABASE_URL=TEST_DB_URL)
    subprocess.run(
        [".venv/bin/alembic", "upgrade", "head"],
        cwd=BACKEND_DIR,
        env=env,
        check=True,
        capture_output=True,
    )


@pytest.fixture(scope="session")
def anyio_backend():
    return "asyncio"


@pytest.fixture(scope="session")
async def client():
    register_handlers()
    app = create_app()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


@pytest.fixture
async def dispatcher():
    return Dispatcher()


async def _make_user(**kwargs) -> tuple[str, str]:
    """Create a user row and return (access_token, user_id)."""
    maker = get_sessionmaker()
    ctx = TenantContext(tenant_id=kwargs.get("tenant_id"), platform_scope=True)
    token_ctx = set_tenant_context(ctx)
    async with maker() as session:
        await session.begin()
        user = User(
            tenant_id=kwargs["tenant_id"],
            email=kwargs["email"],
            full_name=kwargs.get("full_name", "Test User"),
            is_active=True,
            is_platform=kwargs.get("is_platform", False),
        )
        user.credential = Credential(password_hash=hash_password(kwargs["password"]))
        session.add(user)
        await session.flush()
        user_id = str(user.id)
        if kwargs.get("is_platform"):
            role = await seed_platform_roles(session, kwargs["tenant_id"])
            session.add(UserRole(user_id=user.id, role_id=role.id))
        await session.commit()
    reset_tenant_context(token_ctx)
    token, _ = create_access_token(
        user_id=user_id,
        tenant_id=str(kwargs["tenant_id"]),
        claims={"is_platform": kwargs.get("is_platform", False)},
    )
    return token, user_id


@pytest.fixture(scope="session")
async def platform_token() -> str:
    settings = get_settings()
    token, _ = await _make_user(
        tenant_id=uuid.UUID(settings.platform_tenant_id),
        email="platform@example.com",
        password="platform-pass-123",
        is_platform=True,
    )
    return token


@pytest.fixture(scope="session")
async def gym_a(client, platform_token) -> dict:
    return await provision_gym(client, platform_token, "gyma")


@pytest.fixture(scope="session")
async def gym_b(client, platform_token) -> dict:
    return await provision_gym(client, platform_token, "gymb")
