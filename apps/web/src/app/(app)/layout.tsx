"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { cn, EmptyState, TrafficLights } from "@/components/ui";
import { AppShellSkeleton } from "@/components/skeletons";
import { useAuth } from "@/lib/auth";
import { useNotificationsData } from "@/lib/hooks";
import { canAny, usePermissions } from "@/lib/permissions";
import { exitImpersonation, getImpersonationOrigin } from "@/lib/impersonation";

const icons: Record<string, React.ReactNode> = {
  overview: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </svg>
  ),
  members: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
      <circle cx="9" cy="8" r="3.5" />
      <path d="M3.5 20c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M17.5 15.5c2.2 0 3.5 1.6 3.5 4" />
    </svg>
  ),
  checkins: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" strokeLinecap="round" />
    </svg>
  ),
  plans: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d="M4 5h16v4H4z" />
      <path d="M4 13h16v6H4z" />
    </svg>
  ),
  subscriptions: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d="M4 6h16M4 12h16M4 18h10" strokeLinecap="round" />
      <circle cx="18" cy="18" r="3" />
    </svg>
  ),
  billing: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
      <rect x="3" y="6" width="18" height="13" rx="2" />
      <path d="M3 10h18M7 15h4" strokeLinecap="round" />
    </svg>
  ),
  notifications: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d="M6 9a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6" />
      <path d="M10 19a2 2 0 0 0 4 0" />
    </svg>
  ),
  branches: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d="M12 21s-7-5.6-7-11a7 7 0 0 1 14 0c0 5.4-7 11-7 11z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  ),
  settings: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.5l1.6 2.1 2.6-.4 1 2.4 2.4 1-.4 2.6 2.1 1.6-2.1 1.6.4 2.6-2.4 1-1 2.4-2.6-.4-1.6 2.1-1.6-2.1-2.6.4-1-2.4-2.4-1 .4-2.6L2.5 12l2.1-1.6-.4-2.6 2.4-1 1-2.4 2.6.4z" />
    </svg>
  ),
  roles: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d="M9 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
      <path d="M16 10h5.5M16 14h3.5M18.75 12v-3" strokeLinecap="round" />
    </svg>
  ),
  globe: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
    </svg>
  ),
  chart: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d="M3 3v18h18" strokeLinecap="round" />
      <rect x="6.5" y="11" width="3" height="7" rx="1" />
      <rect x="11.5" y="6" width="3" height="12" rx="1" />
      <rect x="16.5" y="13" width="3" height="5" rx="1" />
    </svg>
  ),
};

const nav: {
  href: string;
  label: string;
  icon: string;
  perm?: string | string[];
}[] = [
  { href: "/", label: "Overview", icon: "overview" },
  { href: "/members", label: "Members", icon: "members", perm: "members.view" },
  { href: "/checkins", label: "Check-ins", icon: "checkins", perm: ["attendance.checkin", "attendance.records.view"] },
  { href: "/plans", label: "Plans", icon: "plans", perm: "membership.plans.view" },
  { href: "/subscriptions", label: "Subscriptions", icon: "subscriptions", perm: "membership.subscriptions.view" },
  { href: "/billing", label: "Billing", icon: "billing", perm: "billing.invoices.view" },
  { href: "/notifications", label: "Notifications", icon: "notifications", perm: "notifications.view" },
  { href: "/branches", label: "Branches", icon: "branches", perm: "tenancy.branches.view" },
  { href: "/roles", label: "Roles", icon: "roles", perm: "roles.manage" },
];

const platformNav: {
  href: string;
  label: string;
  icon: string;
}[] = [
  { href: "/platform", label: "Overview", icon: "overview" },
  { href: "/platform/gyms", label: "Gyms", icon: "globe" },
  { href: "/platform/owners", label: "Gym owners", icon: "members" },
  { href: "/platform/subscriptions", label: "Subscriptions", icon: "subscriptions" },
  { href: "/platform/revenue", label: "Revenue", icon: "chart" },
];

const titles: Record<string, string> = {
  "/": "Overview",
  "/members": "Members",
  "/checkins": "Check-ins",
  "/plans": "Plans",
  "/subscriptions": "Subscriptions",
  "/billing": "Billing",
  "/notifications": "Notifications",
  "/branches": "Branches",
  "/roles": "Roles",
  "/settings": "Settings",
  "/platform": "Platform overview",
  "/platform/gyms": "Gyms",
  "/platform/owners": "Gym owners",
  "/platform/subscriptions": "Platform subscriptions",
  "/platform/revenue": "Revenue",
};

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="relative flex h-7 w-7 items-center justify-center rounded-[9px] bg-accent shadow-[0_0_20px_var(--color-glow-strong)]">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent-ink)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M13 2 4.5 13.5H11L9.5 22 19 9.5h-6.5L13 2z" />
        </svg>
      </div>
      <span className="font-display text-[15px] font-bold tracking-[0.14em] text-ink">
        FORGE
      </span>
    </div>
  );
}

function ThemeToggle({ theme, onToggle }: { theme: "light" | "dark"; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className="flex h-8 w-8 items-center justify-center rounded-full border border-line bg-fill text-ink-soft transition-colors hover:bg-fill-strong hover:text-ink"
      title={theme === "dark" ? "Switch to light" : "Switch to dark"}
    >
      {theme === "dark" ? (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <circle cx="12" cy="12" r="4.5" />
          <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19" />
        </svg>
      ) : (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        </svg>
      )}
    </button>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const title = titles[pathname] ?? "FORGE";
  const { me, loading, logout } = useAuth();
  const { unread } = useNotificationsData();
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const [impersonating] = useState(
    () => typeof window !== "undefined" && getImpersonationOrigin() !== null,
  );

  useEffect(() => {
    if (!loading && !me) router.replace("/login");
  }, [loading, me, router]);
  useEffect(() => {
    const t = document.documentElement.classList.contains("dark") ? "dark" : "light";
    setTheme(t);
  }, []);

  if (loading || !me) {
    return <AppShellSkeleton />;
  }

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("forge-theme", next);
    document.documentElement.classList.toggle("dark", next === "dark");
  };

  const perms = me?.permissions ?? [];
  const isPlatform = !!me?.is_platform;
  const gymNav = nav.filter(
    (item) =>
      !item.perm ||
      canAny(perms, Array.isArray(item.perm) ? item.perm : [item.perm]),
  );
  const visibleNav = isPlatform ? platformNav : gymNav;
  const current = nav.find((item) =>
    item.href === "/" ? pathname === "/" : pathname.startsWith(item.href),
  );
  const denied = isPlatform
    ? !pathname.startsWith("/platform") && pathname !== "/settings"
    : pathname.startsWith("/platform") ||
      (!!current &&
        !!current.perm &&
        !canAny(perms, Array.isArray(current.perm) ? current.perm : [current.perm]));

  const fullName = me.user.full_name || me.user.email;
  const initials = fullName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();

  const handleLogout = () => {
    void logout().then(() => router.push("/login"));
  };

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="flex w-[236px] shrink-0 flex-col border-r border-line bg-canvas/85 backdrop-blur-2xl">
        <div className="flex items-center justify-between px-4 pb-3 pt-4">
          <Logo />
          <TrafficLights />
        </div>

        <div className="px-4 pb-3">
          <p className="kicker">{isPlatform ? "Platform" : "Workspace"}</p>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-3">
          {visibleNav.map((item) => {
            const active =
              item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "group relative flex items-center gap-2.5 rounded-[10px] px-2.5 py-[8px] text-[13px] font-semibold transition-all duration-150",
                  active
                    ? "bg-accent text-accent-ink shadow-[0_2px_14px_var(--color-glow)]"
                    : "text-ink-soft hover:bg-fill hover:text-ink",
                )}
              >
                <span className={active ? "" : "text-ink-faint group-hover:text-accent"}>
                  {icons[item.icon]}
                </span>
                {item.label}
                {item.label === "Notifications" && unread > 0 && (
                  <span
                    className={`ml-auto flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold ${
                      active ? "bg-accent-ink/15 text-accent-ink" : "bg-red text-white"
                    }`}
                  >
                    {unread > 99 ? "99+" : unread}
                  </span>
                )}
              </Link>
            );
          })}

          <div className="my-2 border-t border-line" />

          <Link
            href="/settings"
            className={cn(
              "group flex items-center gap-2.5 rounded-[10px] px-2.5 py-[8px] text-[13px] font-semibold transition-colors duration-150",
              pathname === "/settings"
                ? "bg-accent text-accent-ink"
                : "text-ink-soft hover:bg-fill hover:text-ink",
            )}
          >
            <span className={cn(pathname === "/settings" ? "" : "text-ink-faint group-hover:text-accent")}>
              {icons.settings}
            </span>
            Settings
          </Link>
        </nav>

        <div className="border-t border-line p-3">
          <div className="flex items-center gap-2.5 rounded-xl border border-line bg-fill px-2.5 py-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-accent to-accent-deep text-[12px] font-bold text-accent-ink">
              {initials || "U"}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold leading-tight">{fullName}</p>
              <p className="truncate text-[11px] text-ink-faint">{me.tenant_name ?? "Platform"}</p>
            </div>
            <ThemeToggle theme={theme} onToggle={toggleTheme} />
            <button
              onClick={handleLogout}
              className="text-ink-faint transition-colors hover:text-red"
              title="Sign out"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {impersonating && (
          <div className="flex h-9 shrink-0 items-center justify-between border-b border-amber/40 bg-amber-soft/70 px-6 text-[12px]">
            <span className="font-semibold text-amber">
              Viewing the gym workspace as {me.user.email}
            </span>
            <button
              onClick={exitImpersonation}
              className="rounded-md bg-amber px-2.5 py-0.5 font-semibold text-white transition-colors hover:bg-amber/80"
            >
              Exit to platform
            </button>
          </div>
        )}
        <header className="flex h-[52px] shrink-0 items-center justify-between border-b border-line bg-canvas/70 px-6 backdrop-blur-xl">
          <h1 className="font-display text-[15px] font-semibold tracking-tight">{title}</h1>
          <div className="flex items-center gap-4 text-[12px] text-ink-faint">
            <span className="flex items-center gap-2">
              <span className="pulse-dot h-2 w-2 rounded-full bg-green" />
              All systems live
            </span>
            <span className="hidden sm:inline">Wed, Aug 3</span>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto px-6 py-6">
          {denied ? (
            <EmptyState
              title="Restricted area"
              hint={`Your role doesn't have permission to open ${current?.label ?? "this section"}. Ask your gym owner to grant access if needed.`}
            />
          ) : (
            children
          )}
        </main>
      </div>
    </div>
  );
}
