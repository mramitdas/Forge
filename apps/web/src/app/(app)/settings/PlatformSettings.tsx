"use client";

import { useState } from "react";
import { Button, Card, Field, Input, SectionTitle, Toast } from "@/components/ui";
import { ApiError, apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useUpdateMe } from "@/lib/hooks";
import { allChecksPass, passwordChecks } from "@/lib/password";
import type { PasswordRule } from "@/lib/password";
import type { TokenResponse } from "@/lib/types";

const CHECK_ROWS: { key: PasswordRule; label: string }[] = [
  { key: "uppercase", label: "Uppercase letter" },
  { key: "lowercase", label: "Lowercase letter" },
  { key: "digit", label: "Number" },
  { key: "special", label: "Special character" },
  { key: "length", label: "At least 8 characters" },
];

function PasswordChecklist({ checks }: { checks: Record<PasswordRule, boolean> }) {
  return (
    <ul className="mt-2 space-y-1" aria-label="Password strength">
      {CHECK_ROWS.map((row) => (
        <li key={row.key} className="flex items-center gap-2 text-[12px]">
          <span aria-hidden className={checks[row.key] ? "text-green" : "text-ink-faint"}>
            {checks[row.key] ? "✓" : "✗"}
          </span>
          <span className={checks[row.key] ? "text-ink-soft" : "text-ink-faint"}>
            {row.label}
          </span>
        </li>
      ))}
    </ul>
  );
}

export default function PlatformSettings() {
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

  async function saveProfile() {
    setSavingProfile(true);
    try {
      const updated = await updateMe.mutateAsync({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
      });
      // PATCH response is the full MeOut — feed it straight into the context
      // (same pattern as GymSettings.saveProfile).
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

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Card className="p-6">
        <SectionTitle title="Profile" subtitle="Your account details" />
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

      {toast && <Toast type={toast.type} message={toast.message} onClose={() => setToast(null)} />}
    </div>
  );
}
