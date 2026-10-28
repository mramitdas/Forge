"""
Coverage for 0022_two_tier_permissions on a populated database.

Runs the real migration chain against a dedicated throwaway temp database
(`gym_erp_migtest_<timestamp>`) — never against `gym_erp` (dev) or
`gym_erp_test` (the pytest session DB, which is managed by the autouse
`migrated_database` fixture in conftest). Both fixtures stay untouched:
this test drives sync psycopg2 engines and its own GYM_DATABASE_URL for
every alembic invocation.

Seeded legacy state at revision 0021:
- a platform user (0022 discovery keys off users.is_platform),
- a gym tenant with a "Front Desk" staff role holding granular codes,
- a "Gym Owner" role holding pre-0022 granular codes.

Asserts after `alembic upgrade head`:
- legacy granular codes are retired from the catalog and role permissions,
- non-owner staff role templates (and their assignments) are removed,
- Gym Owner holds exactly the 18 two-tier codes (9 modules x view/manage).
"""

from __future__ import annotations

import os
import subprocess
import time
import uuid
from pathlib import Path

import psycopg2
import pytest
from app.modules.identity.permissions import PERMISSIONS
from psycopg2.extras import register_uuid

register_uuid()

BACKEND_DIR = Path(__file__).resolve().parents[1]

_DB_HOST = "127.0.0.1"
_DB_PORT = "5432"
_DB_USER = "gym"
_DB_PASSWORD = "gym_dev_pass"

_ADMIN_CREDENTIALS = (
    (_DB_USER, _DB_PASSWORD),
    ("gym_admin", "gym_admin_pass"),
)

_PLATFORM_ID = uuid.uuid4()
_PLATFORM_TENANT_ID = uuid.uuid4()
_GYM_TENANT_ID = uuid.uuid4()

LEGACY_CODES = (
    ("members.create", "members"),
    ("members.delete", "members"),
    ("billing.capture", "billing"),
    ("plans.legacy_assign", "membership"),
)

_LEGACY_CODE_NAMES = tuple(code for code, _ in LEGACY_CODES)

_GYM_CODE_PREDICATE = lambda p: not p["code"].startswith("platform.")  # noqa: E731
_EXPECTED_GYM_CODES = frozenset(p["code"] for p in PERMISSIONS if _GYM_CODE_PREDICATE(p))
_EXPECTED_PLATFORM_CODES = frozenset(
    p["code"] for p in PERMISSIONS if p["code"].startswith("platform.")
)


def _connect(dbname: str, user: str, password: str):
    return psycopg2.connect(
        host=_DB_HOST,
        port=_DB_PORT,
        dbname=dbname,
        user=user,
        password=password,
    )


def _connect_autocommit(dbname: str) -> psycopg2.extensions.connection:
    last_exc: Exception | None = None
    for user, password in _ADMIN_CREDENTIALS:
        try:
            conn = _connect(dbname, user, password)
        except psycopg2.OperationalError as exc:  # pragma: no cover - env dependent
            last_exc = exc
            continue
        conn.autocommit = True
        return conn
    raise RuntimeError(
        "Could not connect to the postgres maintenance DB as gym or gym_admin"
    ) from last_exc


def _drop_database(dbname: str) -> None:
    conn = _connect_autocommit("postgres")
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT pg_terminate_backend(pid)
                FROM pg_stat_activity
                WHERE datname = %s AND pid <> pg_backend_pid()
                """,
                (dbname,),
            )
            cur.execute(f'DROP DATABASE IF EXISTS "{dbname}"')
            cur.execute(
                "SELECT 1 FROM pg_database WHERE datname = %s",
                (dbname,),
            )
            assert cur.fetchone() is None, f"temp database {dbname} still exists after drop"
    finally:
        conn.close()


def _run_alembic(db_url: str, *args: str) -> subprocess.CompletedProcess:
    env = dict(os.environ)
    env["GYM_DATABASE_URL"] = db_url
    return subprocess.run(  # noqa: S603 - fixed binary/args, no user input
        [".venv/bin/alembic", *args],
        cwd=BACKEND_DIR,
        env=env,
        capture_output=True,
        text=True,
    )


def _seed_legacy_state(dbname: str) -> uuid.UUID:
    """Insert pre-0022 gym role/permission rows; return the Front Desk role id."""
    conn = _connect(dbname, _DB_USER, _DB_PASSWORD)
    try:
        conn.autocommit = False
        with conn.cursor() as cur:
            cur.execute("SELECT set_config('app.platform_scope', 'on', false)")

            cur.execute(
                """
                INSERT INTO users
                    (id, tenant_id, email, full_name, first_name, last_name,
                     is_active, is_platform, version)
                VALUES (%s, %s, %s, %s, %s, %s, true, true, 1)
                """,
                (
                    _PLATFORM_ID,
                    _PLATFORM_TENANT_ID,
                    "migration-platform@example.test",
                    "Migration Platform Admin",
                    "Migration",
                    "Admin",
                ),
            )

            owner_role_id = uuid.uuid4()
            front_desk_role_id = uuid.uuid4()
            for role_id, name, is_editable in (
                (owner_role_id, "Gym Owner", False),
                (front_desk_role_id, "Front Desk", True),
            ):
                cur.execute(
                    """
                    INSERT INTO roles
                        (id, tenant_id, name, description, is_system, is_editable,
                         is_active, version)
                    VALUES (%s, %s, %s, %s, %s, %s, true, 1)
                    """,
                    (
                        role_id,
                        _GYM_TENANT_ID,
                        name,
                        f"Legacy {name} role seeded at 0021",
                        not is_editable,
                        is_editable,
                    ),
                )

            for code, module in LEGACY_CODES:
                cur.execute(
                    """
                    INSERT INTO permission_catalog (code, module, description)
                    VALUES (%s, %s, %s)
                    """,
                    (code, module, f"Legacy granular capability {code}"),
                )

            for role_id, codes in (
                (owner_role_id, _LEGACY_CODE_NAMES),
                (front_desk_role_id, ("members.create", "billing.capture")),
            ):
                for code in codes:
                    cur.execute(
                        """
                        INSERT INTO role_permissions
                            (id, role_id, permission_code, branch_scope)
                        VALUES (%s, %s, %s, 'all')
                        """,
                        (uuid.uuid4(), role_id, code),
                    )

            cur.execute(
                "INSERT INTO user_roles (id, user_id, role_id) VALUES (%s, %s, %s)",
                (uuid.uuid4(), _PLATFORM_ID, front_desk_role_id),
            )
        conn.commit()
        return front_desk_role_id
    finally:
        conn.close()


def test_0022_upgrade_on_populated_legacy_database():
    temp_db = f"gym_erp_migtest_{time.strftime('%Y%m%d%H%M%S')}_{uuid.uuid4().hex[:8]}"
    temp_url = f"postgresql+asyncpg://{_DB_USER}:{_DB_PASSWORD}@{_DB_HOST}:{_DB_PORT}/{temp_db}"

    create = _connect_autocommit("postgres")
    try:
        with create.cursor() as cur:
            cur.execute(f'CREATE DATABASE "{temp_db}"')
    finally:
        create.close()

    try:
        # Build the real schema at the pre-0022 revision...
        to_0021 = _run_alembic(temp_url, "upgrade", "0021_member_status_enum")
        assert to_0021.returncode == 0, (
            f"upgrade to 0021 failed:\n{to_0021.stderr}\n{to_0021.stdout}"
        )

        front_desk_role_id = _seed_legacy_state(temp_db)

        # ...then apply the migration under test.
        to_head = _run_alembic(temp_url, "upgrade", "head")
        assert to_head.returncode == 0, f"upgrade head failed:\n{to_head.stderr}\n{to_head.stdout}"
        assert "0022_two_tier_permissions" in to_head.stderr, to_head.stderr

        conn = _connect(temp_db, _DB_USER, _DB_PASSWORD)
        try:
            with conn.cursor() as cur:
                cur.execute("SELECT set_config('app.platform_scope', 'on', false)")

                cur.execute("SELECT code FROM permission_catalog")
                catalog = {row[0] for row in cur.fetchall()}

                cur.execute(
                    "SELECT name FROM roles WHERE tenant_id = %s",
                    (_GYM_TENANT_ID,),
                )
                gym_role_names = {row[0] for row in cur.fetchall()}

                cur.execute(
                    "SELECT 1 FROM roles WHERE id = %s",
                    (front_desk_role_id,),
                )
                front_desk_exists = cur.fetchone() is not None

                cur.execute(
                    "SELECT 1 FROM user_roles WHERE role_id = %s",
                    (front_desk_role_id,),
                )
                assignment_exists = cur.fetchone() is not None

                cur.execute(
                    """
                    SELECT rp.permission_code
                    FROM role_permissions rp
                    JOIN roles r ON r.id = rp.role_id
                    WHERE r.tenant_id = %s AND r.name = 'Gym Owner'
                    """,
                    (_GYM_TENANT_ID,),
                )
                owner_codes = {row[0] for row in cur.fetchall()}
        finally:
            conn.close()
    finally:
        _drop_database(temp_db)

    # Legacy granular codes retired from the catalog and from role grants.
    for code in _LEGACY_CODE_NAMES:
        assert code not in catalog, f"legacy code {code} survived the upgrade"
        assert code not in owner_codes, f"legacy grant {code} survived on Gym Owner"
        assert code not in owner_codes, f"legacy grant {code} survived on Gym Owner"

    assert catalog == _EXPECTED_GYM_CODES | _EXPECTED_PLATFORM_CODES, (
        "permission catalog drifted from the 9x2 gym + platform two-tier set"
    )

    # Non-owner gym staff role templates removed (role + its assignments).
    assert gym_role_names == {"Gym Owner"}, gym_role_names
    assert not front_desk_exists
    assert not assignment_exists

    # Gym Owner rebuilt holding exactly the 18 two-tier codes.
    assert len(_EXPECTED_GYM_CODES) == 18
    assert owner_codes == _EXPECTED_GYM_CODES


@pytest.fixture(autouse=True)
def _guard_shared_databases():
    """Fail loudly if this test ever shadows the shared DBs via env leakage."""
    before = os.environ.get("GYM_DATABASE_URL")
    yield
    assert os.environ.get("GYM_DATABASE_URL") == before
