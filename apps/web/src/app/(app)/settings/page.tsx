"use client";

import { useState } from "react";
import { Badge, Button, Card, Field, Input, SectionTitle, Switch, Toast } from "@/components/ui";
import { Async } from "@/components/skeleton";
import { SettingsBranchSkeleton } from "@/components/skeletons";
import { useAuth } from "@/lib/auth";
import { useCan } from "@/lib/permissions";
import { useGymSettings, useUpdateGymSettings, useUpdateMe } from "@/lib/hooks";

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
  const [toast, setToast] = useState<string | null>(null);
  const updateMe = useUpdateMe();
  const [savingProfile, setSavingProfile] = useState(false);

  const permissions = me?.permissions ?? [];
  const scope = me?.tenant_name ?? "All branches";
  const can = useCan();
  const { settings: gymSettings, isLoading: settingsLoading, isError: settingsError } = useGymSettings();
  const updateGymSettings = useUpdateGymSettings();

  async function saveProfile() {
    setSavingProfile(true);
    try {
      await updateMe.mutateAsync({ full_name: name.trim(), email: email.trim() });
      await refreshMe();
      setToast("Profile updated");
    } catch {
      setToast("Could not save profile — the email may be taken");
    } finally {
      setSavingProfile(false);
    }
  }

  async function toggleCrossBranch(next: boolean) {
    try {
      await updateGymSettings.mutateAsync({ cross_branch_access: next });
      setToast(next ? "Members can now use any branch" : "Members restricted to their home branch");
    } catch {
      setToast("Could not update branch access");
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Card className="p-6">
        <SectionTitle title="Profile" subtitle="Your account details across the organization" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Email">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
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

      {toast && <Toast type="success" message={toast} onClose={() => setToast(null)} />}
    </div>
  );
}
