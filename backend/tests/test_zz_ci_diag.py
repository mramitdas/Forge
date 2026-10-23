from __future__ import annotations

import psycopg2


def test_zz_ci_diagnostics():
    out: list[tuple] = []
    conn = psycopg2.connect("postgresql://gym:gym_dev_pass@127.0.0.1:5432/gym_erp_test")
    conn.autocommit = True
    cur = conn.cursor()
    cur.execute("select version()")
    out.append(("version", cur.fetchone()))
    cur.execute("select current_user, current_setting('row_security')")
    out.append(("session", cur.fetchone()))
    cur.execute(
        "select rolname, rolsuper, rolbypassrls, rolcreatedb from pg_roles "
        "where rolname = current_user"
    )
    out.append(("role", cur.fetchone()))
    cur.execute(
        "select relname, relrowsecurity, relforcerowsecurity, "
        "pg_get_userbyid(relowner) from pg_class "
        "where relname in ('members', 'subscriptions', 'users') order by relname"
    )
    out.append(("rls", cur.fetchall()))
    cur.execute(
        "select tablename, policyname, roles::text, cmd, qual from pg_policies "
        "where tablename in ('members', 'subscriptions') order by tablename"
    )
    out.append(("policy", cur.fetchall()))

    cur.execute("begin")
    cur.execute(
        "select set_config('app.tenant_id', '00000000-0000-0000-0000-000000000000', true)"
    )
    cur.execute("select set_config('app.platform_scope', 'off', true)")
    cur.execute("select count(*) from members")
    out.append(("members visible for empty tenant", cur.fetchone()))
    cur.execute("rollback")
    cur.execute("select count(*) from members")
    out.append(("members visible with no guc", cur.fetchone()))
    conn.close()

    raise AssertionError(out)
