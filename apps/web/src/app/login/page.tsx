"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [focused, setFocused] = useState<"email" | "password" | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const me = await login(email, password);
      router.push(me.is_platform ? "/platform" : "/");
    } catch (err) {
      if (err instanceof ApiError) {
        const detail = err.detail as { code?: string; message?: string } | null;
        setError(detail?.message ?? "Invalid email or password.");
      } else {
        setError("Could not reach the server. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden">
      <div className="pointer-events-none absolute -top-48 left-1/2 h-[520px] w-[760px] -translate-x-1/2 rounded-full bg-accent/10 blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 left-0 h-72 w-72 rounded-full bg-pink-soft blur-3xl" />

      <div className="relative w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-[22px] border border-accent/30 bg-accent-soft shadow-[0_0_50px_var(--color-glow-strong)]">
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-accent" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M13 2 4.5 13.5H11L9.5 22 19 9.5h-6.5L13 2z" />
            </svg>
          </div>
          <p className="kicker mb-1">Gym management, reimagined</p>
          <h1 className="font-display text-[30px] font-bold tracking-[0.18em]">FORGE</h1>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <div
              className={`flex items-center gap-2.5 rounded-xl border bg-fill px-3.5 transition-all duration-150 ${
                focused === "email"
                  ? "border-accent/60 ring-2 ring-accent/15"
                  : "border-line"
              }`}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="text-ink-faint">
                <rect x="3" y="5" width="18" height="14" rx="2" />
                <path d="m3.5 7 8.5 6 8.5-6" />
              </svg>
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onFocus={() => setFocused("email")}
                onBlur={() => setFocused(null)}
                className="h-11 w-full bg-transparent text-[14px] text-ink outline-none placeholder:text-ink-faint"
                autoComplete="email"
              />
            </div>
          </div>

          <div>
            <div
              className={`flex items-center gap-2.5 rounded-xl border bg-fill px-3.5 transition-all duration-150 ${
                focused === "password"
                  ? "border-accent/60 ring-2 ring-accent/15"
                  : "border-line"
              }`}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="text-ink-faint">
                <rect x="4" y="10" width="16" height="10" rx="2" />
                <path d="M8 10V7a4 4 0 0 1 8 0v3" />
              </svg>
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onFocus={() => setFocused("password")}
                onBlur={() => setFocused(null)}
                className="h-11 w-full bg-transparent text-[14px] text-ink outline-none placeholder:text-ink-faint"
                autoComplete="current-password"
              />
            </div>
          </div>

          <Button type="submit" size="lg" className="w-full rounded-xl" disabled={submitting}>
            {submitting ? "Entering…" : "Enter FORGE"}
          </Button>

          {error && (
            <div className="rounded-xl border border-red-soft bg-red-soft px-3.5 py-2.5 text-[12px] font-medium text-red animate-fade-in">
              {error}
            </div>
          )}

          <div className="flex items-center justify-between text-[12px]">
            <button type="button" className="text-ink-faint transition-colors hover:text-accent">
              Forgot password?
            </button>
            <button type="button" className="text-ink-faint transition-colors hover:text-accent">
              Use Touch ID
            </button>
          </div>
        </form>

        <p className="mt-10 text-center text-[11px] text-ink-faint">
          Demo build · sign in with any email and password
        </p>
      </div>
    </main>
  );
}
