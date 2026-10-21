"use client";

import { useEffect, useRef, useState } from "react";
import { PasswordChecklist } from "@/components/password-checklist";
import { PermissionPills } from "@/components/permission-pills";
import { Badge, Button, Card, Field, Input, SectionTitle, Select, Switch, Toast } from "@/components/ui";
import { Async } from "@/components/skeleton";
import { SettingsBranchSkeleton } from "@/components/skeletons";
import { ApiError, apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useCan } from "@/lib/permissions";
import { useGymSettings, useUpdateGymSettings, useUpdateMe } from "@/lib/hooks";
import { allChecksPass, passwordChecks } from "@/lib/password";
import { TIMEZONES, formatTimezone } from "@/lib/timezones";
import type { TokenResponse } from "@/lib/types";

export default function GymSettings() {
  const { me, refreshMe, completePasswordChange } = useAuth();
  const user = me?.user;
  const fallbackName = (user?.full_name ?? "").trim().split(" ");
  const [firstName, setFirstName] = useState(user?.first_name || fallbackName[0] || "");
  const [lastName, setLastName] = useState(
    user?.last_name || fallbackName.slice(1).join(" ") || "",
  );
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  function notify(message: string, type: "success" | "error" = "success") {
    setToast({ message, type });
  }
  const updateMe = useUpdateMe();
  const [savingProfile, setSavingProfile] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [currentError, setCurrentError] = useState<string | null>(null);
  const [changingPassword, setChangingPassword] = useState(false);

  const result = passwordChecks(next);
  const canSubmitPassword =
    allChecksPass(result) && next === confirm && next.length > 0 && current.length > 0;

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
        first_name: firstName.trim(),
        last_name: lastName.trim(),
      });
      // PATCH response is the full MeOut — feed it straight into the context
      // (same pattern as PlatformSettings.saveProfile).
      await refreshMe(updated);
      setFirstName(updated.user.first_name);
      setLastName(updated.user.last_name);
      notify("Profile updated");
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) {
        notify("Email can't be changed", "error");
      } else if (e instanceof ApiError && e.status === 422) {
        notify(
          (e.detail as { message?: string } | null)?.message ?? "Check the name format",
          "error",
        );
      } else {
        notify("Could not save profile — check your connection", "error");
      }
    } finally {
      setSavingProfile(false);
    }
  }

  async function savePassword() {
    setCurrentError(null);
    setChangingPassword(true);
    try {
      const tokens = await apiFetch<TokenResponse>("/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ current_password: current, new_password: next }),
      });
      await completePasswordChange(tokens);
      setCurrent("");
      setNext("");
      setConfirm("");
      notify("Password updated");
    } catch (e) {
      if (e instanceof ApiError) {
        const detail = e.detail as {
          code?: string;
          message?: string;
          details?: { failed?: string[] };
        } | null;
        if (detail?.code === "INVALID_CURRENT_PASSWORD") {
          setCurrentError("Current password is incorrect");
        } else if (detail?.code === "PASSWORD_TOO_WEAK") {
          notify(
            `Password too weak — missing: ${detail.details?.failed?.join(", ") ?? "requirements"}`,
            "error",
          );
        } else {
          notify(detail?.message ?? "Could not change password", "error");
        }
      } else {
        notify("Could not reach the server", "error");
      }
    } finally {
      setChangingPassword(false);
    }
  }

  async function toggleCrossBranch(nextValue: boolean) {
    try {
      await updateGymSettings.mutateAsync({ cross_branch_access: nextValue });
      notify(
        nextValue
          ? "Members can now use any branch"
          : "Members restricted to their home branch",
      );
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
          <Field label="First name">
            <Input
              id="settings-first-name"
              name="settings-first-name"
              aria-label="First name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
            />
          </Field>
          <Field label="Last name">
            <Input
              id="settings-last-name"
              name="settings-last-name"
              aria-label="Last name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
            />
          </Field>
          <Field label="Email">
            <Input
              type="email"
              id="settings-email"
              name="settings-email"
              aria-label="Email"
              value={user?.email ?? ""}
              readOnly
              disabled
              aria-readonly="true"
            />
          </Field>
        </div>
        <p className="mt-2 text-[12px] text-ink-faint">Email can&apos;t be changed.</p>
        <div className="mt-4 flex justify-end">
          <Button
            onClick={saveProfile}
            disabled={savingProfile || firstName.trim().length < 1}
          >
            {savingProfile ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </Card>

      <Card className="p-6">
        <SectionTitle title="Password" subtitle="Change your account password" />
        <div className="space-y-4">
          <Field label="Current password">
            <Input
              type="password"
              id="settings-current-password"
              name="settings-current-password"
              aria-label="Current password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
          </Field>
          {currentError && <p className="text-[13px] text-red">{currentError}</p>}
          <div>
            <Field label="New password">
              <Input
                type="password"
                id="settings-new-password"
                name="settings-new-password"
                aria-label="New password"
                autoComplete="new-password"
                value={next}
                onChange={(e) => setNext(e.target.value)}
              />
            </Field>
            <PasswordChecklist checks={result.checks} />
          </div>
          <Field label="Confirm new password">
            <Input
              type="password"
              id="settings-confirm-password"
              name="settings-confirm-password"
              aria-label="Confirm new password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </Field>
          {next.length > 0 && next !== confirm && (
            <p className="text-[13px] text-red">Passwords do not match.</p>
          )}
          <div className="flex justify-end">
            <Button
              onClick={savePassword}
              disabled={!canSubmitPassword || changingPassword}
            >
              {changingPassword ? "Saving…" : "Update password"}
            </Button>
          </div>
        </div>
      </Card>

      {can("tenancy.settings.manage") && (
        <Async
          loading={settingsLoading}
          error={settingsError}
          skeleton={<SettingsBranchSkeleton />}
        >
          <Card className="p-6">
            <SectionTitle
              title="Gym profile & branch access"
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
                      {formatTimezone(tz)}
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

            <div className="mt-6 flex items-start justify-between gap-6 border-t border-line pt-5">
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
            {me?.branches && me.branches.length > 0 && (
              <div className="mt-4 space-y-1.5">
                {me.branches.map((b) => (
                  <div
                    key={b.id}
                    className="flex items-center gap-2 rounded-lg border border-line bg-fill px-3 py-2 text-[13px]"
                  >
                    <span className="font-medium text-ink-soft">{b.name}</span>
                    {b.timezone && (
                      <span className="text-[12px] text-ink-faint">{formatTimezone(b.timezone)}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </Async>
      )}

      <Card className="p-6">
        <SectionTitle title="Role & permissions" subtitle="Your role and what it can do" />
        <div className="flex items-center gap-2">
          <span className="text-[12px] text-ink-faint">Role:</span>
          <Badge tone="blue">{me?.role_name ?? "Member"}</Badge>
          <Badge tone="gray">{scope}</Badge>
        </div>
        <PermissionPills permissions={me?.permissions ?? []} />
      </Card>

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
