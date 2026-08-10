"""Row Level Security enablement.

RLS is the DB-enforced guarantee of tenant isolation. Every tenant-scoped table
gets the same policy: a row is visible only when its tenant_id equals the
transaction-local `app.tenant_id`, or when the caller runs in platform scope.
FORCE RLS keeps the table owner subject to the policy too (the application user
is the table owner, so this is what makes a forgotten app-level filter harmless).
"""

from sqlalchemy import text

_TENANT_POLICY = """
CREATE POLICY tenant_isolation ON {table}
USING (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    OR current_setting('app.platform_scope', true) = 'on'
)
WITH CHECK (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    OR current_setting('app.platform_scope', true) = 'on'
);
"""


def enable_rls(connection, table_name: str) -> None:
    connection.execute(text(f'DROP POLICY IF EXISTS tenant_isolation ON "{table_name}"'))
    connection.execute(text(_TENANT_POLICY.format(table=table_name)))
    connection.execute(text(f'ALTER TABLE "{table_name}" ENABLE ROW LEVEL SECURITY'))
    connection.execute(text(f'ALTER TABLE "{table_name}" FORCE ROW LEVEL SECURITY'))
