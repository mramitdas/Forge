"use client";

import { useEffect, useRef, useState } from "react";
import { Badge, Button, Card, Field, Input, SectionTitle, Select, Switch, Toast } from "@/components/ui";
import { Async } from "@/components/skeleton";
import { SettingsBranchSkeleton } from "@/components/skeletons";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useCan } from "@/lib/permissions";
import { useGymSettings, useUpdateGymSettings, useUpdateMe } from "@/lib/hooks";
import { TIMEZONES } from "@/lib/timezones";

function prettifyPermission(p: string): string {
  return p
    .replace(/^members\./, "")
    .replace(/\./g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function SettingsPage() {
  const { me, refreshMe } = useAuth();
  const user = me?.user;
  const [name, setName] = useState(user?.full_name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  function notify(message: string, type: "success" | "error" = "success") {
    setToast({ message, type });
  }
  const updateMe = useUpdateMe();
  const [savingProfile, setSavingProfile] = useState(false);

  const permissions = me?.permissions ?? [];
  const scope = me?.tenant_name ?? "All branches";
  const can = useCan();
  const { settings: gymSettings, isLoading: settingsLoading, isError: settingsError } = useGymSettings();
  const updateGymSettings = useUpdateGymSettings();
  const [gymName, setGymName] = useState("");
  const [gymTimezone, setGymTimezone] = useState("Asia/Kolkata");
  const seededRef = useRef<{ name: string; timezone: string } | null>(null);

  useEffect(() => {
    if (gymSettings && !seededRef.current) {
      seededRef.current = { name: gymSettings.name, timezone: gymSettings.timezone };
      setGymName(gymSettings.name);
      setGymTimezone(gymSettings.timezone);
    }
  }, [gymSettings]);

  async function saveProfile() {
    setSavingProfile(true);
    try {
      const updated = await updateMe.mutateAsync({
        full_name: name.trim(),
        email: email.trim(),
      });
      // The PATCH response is the full MeOut — feed it straight into the
      // context so a flaky follow-up GET can't bounce the user to /login
      // while the toast claims success.
      await refreshMe(updated);
      // Seed the inputs from the server response (it lowercases email) —
      // re-seeding from local state would show casing the server rejected.
      setName(updated.user.full_name);
      setEmail(updated.user.email);
      notify("Profile updated");
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        notify("That email is already taken", "error");
      } else if (e instanceof ApiError && e.status === 422) {
        notify("Check the name and email format", "error");
      } else {
        notify("Could not save profile — check your connection", "error");
      }
    } finally {
      setSavingProfile(false);
    }
  }

  async function toggleCrossBranch(next: boolean) {
    try {
      await updateGymSettings.mutateAsync({ cross_branch_access: next });
      notify(next ? "Members can now use any branch" : "Members restricted to their home branch");
    } catch {
      notify("Could not update branch access", "error");
    }
  }

  async function saveGymProfile() {
    const snapshot = seededRef.current;
    const body: { name?: string; timezone?: string } = {};
    if (!snapshot || gymName.trim() !== snapshot.name) body.name = gymName.trim();
    if (!snapshot || gymTimezone !== snapshot.timezone) body.timezone = gymTimezone;
    try {
      const updated = await updateGymSettings.mutateAsync(body);
      // Re-sync both fields from the server response (normalization, and any
      // external edits to untouched fields), and advance the diff snapshot.
      seededRef.current = { name: updated.name, timezone: updated.timezone };
      setGymName(updated.name);
      setGymTimezone(updated.timezone);
      // Functional update: builds on the LATEST context state, not this
      // render's closure — a concurrent profile save can't be clobbered.
      // (A plain refreshMe() GET would be an extra round trip with a
      // partial-failure window — see saveProfile.)
      void refreshMe((prev) => (prev ? { ...prev, tenant_name: updated.name } : prev));
      notify("Gym profile updated");
    } catch (e) {
      if (e instanceof ApiError && e.status === 422) {
        notify("Gym name must be 2–200 characters", "error");
      } else {
        notify("Could not save gym profile", "error");
      }
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Card className="p-6">
        <SectionTitle title="Profile" subtitle="Your account details across the organization" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name">
            <Input id="settings-full-name" name="settings-full-name" aria-label="Full name" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Email">
            <Input type="email" id="settings-email" name="settings-email" aria-label="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
        </div>
        <div className="mt-4 flex justify-end">
          <Button onClick={saveProfile} disabled={savingProfile}>
            {savingProfile ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </Card>

      <Card className="p-6">
        <SectionTitle title="Your role & permissions" subtitle="Access is scoped by role and branch" />
        <div className="space-y-2.5">
          <div className="flex items-center justify-between rounded-xl border border-line px-4 py-3">
            <div className="min-w-0">
              <p className="text-[13px] font-medium">{user?.full_name ?? "Current user"}</p>
              <p className="text-[12px] text-ink-faint">{user?.email}</p>
            </div>
            <div className="flex items-center gap-3">
              <Badge tone="blue">{scope}</Badge>
              <span className="w-10 text-right text-[12px] text-ink-faint">{permissions.length}</span>
            </div>
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <SectionTitle title="Granted permissions" subtitle={`${permissions.length} actions available to you`} />
        {permissions.length === 0 ? (
          <p className="text-[13px] text-ink-faint">No granular permissions assigned.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {permissions.map((p) => (
              <span
                key={p}
                className="rounded-md bg-fill px-2.5 py-1 font-mono text-[11px] text-ink-soft"
              >
                {prettifyPermission(p)}
              </span>
            ))}
          </div>
        )}
      </Card>

      {can("tenancy.settings.manage") && (
        <Async
          loading={settingsLoading}
          error={settingsError}
          skeleton={<SettingsBranchSkeleton />}
        >
          <div className="space-y-6">
            <Card className="p-6">
              <SectionTitle
                title="Gym profile"
                subtitle="Name and timezone shown across the workspace"
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Gym name">
                  <Input
                    id="settings-gym-name"
                    name="settings-gym-name"
                    aria-label="Gym name"
                    value={gymName}
                    maxLength={200}
                    onChange={(e) => setGymName(e.target.value)}
                  />
                </Field>
                <Field label="Timezone">
                  <Select id="settings-timezone" name="settings-timezone" aria-label="Timezone" value={gymTimezone} onChange={(e) => setGymTimezone(e.target.value)}>
                    {TIMEZONES.map((tz) => (
                      <option key={tz} value={tz}>
                        {tz}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <div className="mt-4 flex justify-end">
                <Button
                  onClick={saveGymProfile}
                  disabled={updateGymSettings.isPending || gymName.trim().length < 2}
                >
                  {updateGymSettings.isPending ? "Saving…" : "Save gym profile"}
                </Button>
              </div>
            </Card>

            <Card className="p-6">
              <div className="flex items-start justify-between gap-6">
                <div>
                  <SectionTitle
                    title="Branch access"
                    subtitle="Let members with an active membership train at any of your branches"
                  />
                  <p className="mt-2 text-[13px] text-ink-soft">
                    When off, memberships are scoped to the branch they were purchased at and
                    check-ins at other branches are denied.
                  </p>
                </div>
                <Switch
                  checked={gymSettings?.cross_branch_access ?? false}
                  onChange={toggleCrossBranch}
                  disabled={updateGymSettings.isPending}
                  label="Cross-branch access"
                />
              </div>
            </Card>
          </div>
        </Async>
      )}

      {can("roles.manage") && (
        <Card className="flex items-center justify-between p-6">
          <div>
            <p className="text-[14px] font-semibold">Danger zone</p>
            <p className="text-[12px] text-ink-faint">Permanently deactivate this workspace.</p>
          </div>
          <Button variant="danger">Deactivate</Button>
        </Card>
      )}

      {toast && <Toast type={toast.type} message={toast.message} onClose={() => setToast(null)} />}
    </div>
  );
}
