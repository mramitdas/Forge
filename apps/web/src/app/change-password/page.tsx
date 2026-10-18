"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { apiFetch, ApiError } from "@/lib/api";
import type { TokenResponse } from "@/lib/types";

export default function ChangePasswordPage() {
  const router = useRouter();
  const { completePasswordChange, logout } = useAuth();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (next !== confirm) {
      setError("New passwords do not match.");
      return;
    }
    setSubmitting(true);
    try {
      const tokens = await apiFetch<TokenResponse>("/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ current_password: current, new_password: next }),
      });
      await completePasswordChange(tokens);
      router.replace("/");
    } catch (err) {
      if (err instanceof ApiError) {
        const detail = err.detail as { code?: string; message?: string } | null;
        setError(detail?.message ?? "Could not change password.");
      } else {
        setError("Could not reach the server. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center">
      <div className="w-full max-w-sm space-y-5">
        <div className="text-center">
          <p className="kicker mb-1">One-time step</p>
          <h1 className="font-display text-[26px] font-bold tracking-[0.16em]">CHANGE PASSWORD</h1>
          <p className="mt-2 text-[13px] text-ink-soft">
            Your account requires a password change before you can continue.
          </p>
        </div>
        <form onSubmit={onSubmit} className="space-y-3">
          <input
            id="current-password"
            name="current-password"
            type="password"
            autoComplete="current-password"
            placeholder="Current password"
            aria-label="Current password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            required
            className="w-full rounded-xl border border-line bg-fill px-3.5 py-2.5 text-[14px] outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/15"
          />
          <input
            id="new-password"
            name="new-password"
            type="password"
            autoComplete="new-password"
            placeholder="New password"
            aria-label="New password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            required
            minLength={8}
            className="w-full rounded-xl border border-line bg-fill px-3.5 py-2.5 text-[14px] outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/15"
          />
          <input
            id="confirm-password"
            name="confirm-password"
            type="password"
            autoComplete="new-password"
            placeholder="Confirm new password"
            aria-label="Confirm new password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            minLength={8}
            className="w-full rounded-xl border border-line bg-fill px-3.5 py-2.5 text-[14px] outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/15"
          />
          {error && <p className="text-[13px] text-red">{error}</p>}
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? "Saving…" : "Set new password"}
          </Button>
        </form>
        <button
          type="button"
          onClick={() => void logout().then(() => router.push("/login"))}
          className="w-full text-center text-[13px] text-ink-faint hover:text-ink"
        >
          Use a different account
        </button>
      </div>
    </main>
  );
}
