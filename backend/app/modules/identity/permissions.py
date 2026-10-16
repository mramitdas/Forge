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
    # tenancy
    {"code": "tenancy.branches.create", "module": "tenancy", "description": "Create a branch"},
    {"code": "tenancy.branches.view", "module": "tenancy", "description": "View branches"},
    {"code": "tenancy.branches.update", "module": "tenancy", "description": "Update a branch"},
    {"code": "tenancy.branches.delete", "module": "tenancy", "description": "Delete a branch"},
    {
        "code": "tenancy.settings.manage",
        "module": "tenancy",
        "description": "Manage tenant settings",
    },
    # members
    {"code": "members.create", "module": "members", "description": "Create members"},
    {"code": "members.view", "module": "members", "description": "View members"},
    {"code": "members.update", "module": "members", "description": "Update members"},
    {"code": "members.delete", "module": "members", "description": "Delete members"},
    {"code": "members.checkin", "module": "members", "description": "Check a member in"},
    # membership
    {
        "code": "membership.plans.create",
        "module": "membership",
        "description": "Create membership plans",
    },
    {
        "code": "membership.plans.view",
        "module": "membership",
        "description": "View membership plans",
    },
    {
        "code": "membership.plans.update",
        "module": "membership",
        "description": "Update membership plans",
    },
    {
        "code": "membership.plans.delete",
        "module": "membership",
        "description": "Delete membership plans",
    },
    {
        "code": "membership.subscriptions.view",
        "module": "membership",
        "description": "View subscriptions",
    },
    {
        "code": "membership.subscriptions.activate",
        "module": "membership",
        "description": "Activate subscriptions",
    },
    # billing
    {"code": "billing.invoices.view", "module": "billing", "description": "View invoices"},
    {"code": "billing.invoices.create", "module": "billing", "description": "Create invoices"},
    {"code": "billing.payments.capture", "module": "billing", "description": "Capture payments"},
    {"code": "billing.payments.refund", "module": "billing", "description": "Refund payments"},
    {"code": "billing.settings.view", "module": "billing", "description": "View billing settings"},
    # expenses
    {"code": "expenses.view", "module": "expenses", "description": "View expenses"},
    {"code": "expenses.manage", "module": "expenses", "description": "Record and delete expenses"},
    # attendance
    {
        "code": "attendance.records.view",
        "module": "attendance",
        "description": "View attendance records",
    },
    {"code": "attendance.checkin", "module": "attendance", "description": "Record check-ins"},
    # notifications
    {"code": "notifications.view", "module": "notifications", "description": "View notifications"},
    # reports
    {"code": "reports.view", "module": "reports", "description": "View reports and dashboards"},
    {"code": "reports.export", "module": "reports", "description": "Export reports"},
    # identity
    {"code": "roles.manage", "module": "identity", "description": "Manage roles and permissions"},
    {"code": "users.manage", "module": "identity", "description": "Manage employees"},
    {"code": "users.view", "module": "identity", "description": "View employees"},
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
    "branch_manager": {
        "name": "Branch Manager",
        "description": "Day-to-day operations for assigned branch(es)",
        "permissions": [
            "tenancy.branches.view",
            "tenancy.branches.update",
            "members.create",
            "members.view",
            "members.update",
            "members.checkin",
            "membership.plans.view",
            "membership.subscriptions.view",
            "membership.subscriptions.activate",
            "billing.invoices.view",
            "billing.invoices.create",
            "billing.payments.capture",
            "expenses.view",
            "expenses.manage",
            "attendance.records.view",
            "attendance.checkin",
            "notifications.view",
            "reports.view",
        ],
        "scope": "gym",
        "is_editable": True,
    },
    "receptionist": {
        "name": "Receptionist",
        "description": "Front-desk: check-ins, member intake, sales",
        "permissions": [
            "tenancy.branches.view",
            "members.create",
            "members.view",
            "members.update",
            "members.checkin",
            "membership.plans.view",
            "membership.subscriptions.view",
            "billing.invoices.view",
            "billing.invoices.create",
            "billing.payments.capture",
            "attendance.records.view",
            "attendance.checkin",
            "notifications.view",
        ],
        "scope": "gym",
        "is_editable": True,
    },
    "trainer": {
        "name": "Trainer",
        "description": "Schedules, member roster and session activity",
        "permissions": [
            "members.view",
            "membership.plans.view",
            "tenancy.branches.view",
            "attendance.records.view",
            "attendance.checkin",
            "notifications.view",
        ],
        "scope": "gym",
        "is_editable": True,
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
