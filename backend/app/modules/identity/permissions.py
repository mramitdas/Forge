"""Permission catalog: the authoritative list of capabilities.

Static and versioned. Adding a capability is a code change; composing roles from
these capabilities is pure data.
"""

PERMISSIONS: list[dict[str, str]] = [
    # platform
    {"code": "platform.gyms.create", "module": "platform", "description": "Provision a new gym"},
    {"code": "platform.gyms.view", "module": "platform", "description": "View gym registry"},
    {"code": "platform.gyms.update", "module": "platform", "description": "Update gym settings"},
    {
        "code": "platform.owners.manage",
        "module": "platform",
        "description": "Manage gym owners",
    },
    {
        "code": "platform.subscriptions.view",
        "module": "platform",
        "description": "View gym subscriptions and tiers",
    },
    {
        "code": "platform.subscriptions.manage",
        "module": "platform",
        "description": "Change gym tiers and billing",
    },
    {
        "code": "platform.sales.view",
        "module": "platform",
        "description": "View platform sales and revenue",
    },
    {
        "code": "platform.reports.view",
        "module": "platform",
        "description": "View platform-wide reports",
    },
    {
        "code": "platform.settings.manage",
        "module": "platform",
        "description": "Manage platform settings",
    },
    # gym modules: exactly two capabilities per module — view (read-only) and
    # manage (edit/delete; manage always includes view).
    {"code": "tenancy.view", "module": "tenancy", "description": "View branches and gym settings"},
    {
        "code": "tenancy.manage",
        "module": "tenancy",
        "description": "Manage branches and gym settings",
    },
    {"code": "members.view", "module": "members", "description": "View members"},
    {
        "code": "members.manage",
        "module": "members",
        "description": "Manage members and check-ins",
    },
    {
        "code": "membership.view",
        "module": "membership",
        "description": "View plans and subscriptions",
    },
    {
        "code": "membership.manage",
        "module": "membership",
        "description": "Manage plans and subscriptions",
    },
    {"code": "billing.view", "module": "billing", "description": "View invoices and billing"},
    {
        "code": "billing.manage",
        "module": "billing",
        "description": "Manage invoices, payments and billing settings",
    },
    {"code": "expenses.view", "module": "expenses", "description": "View expenses"},
    {
        "code": "expenses.manage",
        "module": "expenses",
        "description": "Record, edit and delete expenses",
    },
    {"code": "attendance.view", "module": "attendance", "description": "View attendance records"},
    {
        "code": "attendance.manage",
        "module": "attendance",
        "description": "Record check-ins and manage attendance",
    },
    {"code": "notifications.view", "module": "notifications", "description": "View notifications"},
    {
        "code": "notifications.manage",
        "module": "notifications",
        "description": "Manage notifications",
    },
    {"code": "reports.view", "module": "reports", "description": "View reports and dashboards"},
    {"code": "reports.manage", "module": "reports", "description": "Manage report settings"},
    {"code": "identity.view", "module": "identity", "description": "View employees"},
    {
        "code": "identity.manage",
        "module": "identity",
        "description": "Manage employees and roles",
    },
]

ROLE_TEMPLATES: dict[str, dict] = {
    "platform_owner": {
        "name": "Platform Owner",
        "description": "Manages the platform: gyms, owners, subscriptions and sales",
        "permissions": "all",
        "scope": "platform",
        "is_system": True,
        "is_editable": False,
    },
    "gym_owner": {
        "name": "Gym Owner",
        "description": "Full control over the gym, branches, employees and finances",
        "permissions": "all",
        "scope": "gym",
        "is_system": True,
        "is_editable": False,
    },
}


def template_permission_codes(template: dict) -> list[str]:
    """Expand a role template's permission shortcut into concrete codes.

    ``"all"`` expands to every catalog code matching the template's scope, so a
    platform-scoped template gets only ``platform.*`` codes and a gym-scoped
    template gets everything else.
    """
    scope = template.get("scope", "gym")
    perms = template["permissions"]
    if perms == "all":
        return [
            p["code"]
            for p in PERMISSIONS
            if p["code"].startswith("platform.") == (scope == "platform")
        ]
    return perms
