"use client";

import { useState } from "react";
import { Button, Card, Field, Input, SectionTitle, Toast } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useUpdateMe } from "@/lib/hooks";

export default function PlatformSettings() {
  const { me, refreshMe } = useAuth();
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
        notify("Check the name format", "error");
      } else {
        notify("Could not save profile — check your connection", "error");
      }
    } finally {
      setSavingProfile(false);
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

      {/* Password card added in Task 7. */}

      {toast && <Toast type={toast.type} message={toast.message} onClose={() => setToast(null)} />}
    </div>
  );
}
