"use client";

import Image from "next/image";
import { forwardRef, useEffect, useRef } from "react";
import { createPortal } from "react-dom";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "subtle";

export function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

const btnBase =
  "inline-flex items-center justify-center gap-1.5 rounded-lg text-[13px] font-semibold transition-all duration-150 select-none disabled:opacity-40 disabled:cursor-not-allowed";

const btnVariants: Record<Variant, string> = {
  primary:
    "bg-accent text-accent-ink hover:bg-accent-hover active:scale-[0.98] shadow-[0_1px_12px_var(--color-glow)]",
  secondary:
    "bg-fill text-ink border border-line-strong backdrop-blur-xl hover:bg-fill-strong active:scale-[0.98]",
  ghost: "text-ink-soft hover:text-ink hover:bg-fill active:scale-[0.98]",
  subtle:
    "bg-accent-soft text-accent hover:bg-accent/25 active:scale-[0.98]",
  danger: "bg-red text-white hover:opacity-90 active:scale-[0.98] shadow-sm",
};

const btnSizes = {
  xs: "h-7 px-2.5 text-[12px]",
  sm: "h-8 px-3.5",
  md: "h-9 px-4",
  lg: "h-10 px-5 text-[14px]",
};

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: keyof typeof btnSizes;
}) {
  return (
    <button
      className={cn(btnBase, btnVariants[variant], btnSizes[size], className)}
      {...rest}
    />
  );
}

export function Switch({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange?: (next: boolean) => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange?.(!checked)}
      className={cn(
        "relative h-6 w-11 shrink-0 rounded-full transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed",
        checked ? "bg-accent" : "bg-fill-strong border border-line-strong",
      )}
    >
      <span
        className={cn(
          "absolute top-1/2 -translate-y-1/2 h-5 w-5 rounded-full bg-white shadow-sm transition-all duration-150",
          checked ? "left-[22px]" : "left-0.5",
        )}
      />
    </button>
  );
}

const inputBase =
  "w-full rounded-lg border border-line bg-fill px-3 h-9 text-[13px] text-ink placeholder:text-ink-faint transition-all focus:border-accent/60 focus:ring-2 focus:ring-accent/20 disabled:bg-fill/50";

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...rest }, ref) {
    return <input ref={ref} className={cn(inputBase, className)} {...rest} />;
  },
);

export function Select({
  className,
  ...rest
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        inputBase,
        "cursor-pointer appearance-none bg-panel-strong pr-8",
        "bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 fill=%22none%22 viewBox=%220 0 20 20%22><path stroke=%22%239ca3af%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22 stroke-width=%221.5%22 d=%22m6 8 4 4 4-4%22/></svg>')] bg-[right_0.55rem_center] bg-no-repeat",
        className,
      )}
      {...rest}
    />
  );
}

export function Textarea({
  className,
  ...rest
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(inputBase, "h-auto py-2 min-h-[72px] resize-none", className)}
      {...rest}
    />
  );
}

export function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="mb-1 block text-[12px] font-medium text-ink-soft">{children}</label>
  );
}

export function Card({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "glass rounded-2xl shadow-[0_8px_24px_var(--color-shadow)] glass-edge",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Kicker({ children }: { children: React.ReactNode }) {
  return <p className="kicker">{children}</p>;
}

export function SectionTitle({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex items-end justify-between">
      <div>
        <h2 className="font-display text-[16px] font-semibold tracking-tight">{title}</h2>
        {subtitle && <div className="mt-0.5 text-[12px] text-ink-faint">{subtitle}</div>}
      </div>
      {action}
    </div>
  );
}

const badgeTone: Record<string, string> = {
  green: "bg-green-soft text-green",
  red: "bg-red-soft text-red",
  amber: "bg-amber-soft text-amber",
  blue: "bg-blue-soft text-blue",
  gray: "bg-fill text-ink-soft",
};

export function Badge({
  tone = "gray",
  children,
}: {
  tone?: keyof typeof badgeTone;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
        badgeTone[tone],
      )}
    >
      {children}
    </span>
  );
}

export function statusTone(status: string): keyof typeof badgeTone {
  switch (status) {
    case "active":
    case "paid":
    case "granted":
      return "green";
    case "paused":
    case "pending":
    case "open":
    case "frozen":
      return "amber";
    case "expired":
    case "overdue":
    case "denied":
    case "cancelled":
    case "void":
    case "inactive":
      return "red";
    case "lead":
      return "blue";
    default:
      return "gray";
  }
}

export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge tone={statusTone(status)}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </Badge>
  );
}

const avatarHues = [
  "bg-[#ffd6c9] text-[#8a3200]",
  "bg-[#cfe0ff] text-[#1f3f8f]",
  "bg-[#c0efd3] text-[#0f5c33]",
  "bg-[#ffe4bd] text-[#8a5a00]",
  "bg-[#e3d9ff] text-[#4a3794]",
  "bg-[#ffd6ea] text-[#8f2f5e]",
  "bg-[#c3ecf3] text-[#0f5c66]",
];

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function Avatar({
  name,
  size = "md",
  src,
}: {
  name: string;
  size?: "sm" | "md" | "lg";
  src?: string | null;
}) {
  const initials = name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const hue = avatarHues[hashStr(name) % avatarHues.length];
  const dims =
    size === "sm" ? "h-7 w-7 text-[11px]" : size === "lg" ? "h-12 w-12 text-[16px]" : "h-9 w-9 text-[13px]";
  if (src) {
    return (
      <Image
        src={src}
        alt={name}
        fill
        sizes="(120px)"
        priority={size === "lg"}
        className={cn("shrink-0 rounded-full object-cover", dims)}
      />
    );
  }
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-bold",
        dims,
        hue,
      )}
    >
      {initials}
    </div>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: { value: T; label: React.ReactNode }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-0.5 rounded-lg bg-fill p-0.5",
        className,
      )}
    >
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-[6px] px-3 h-7 text-[12px] font-semibold transition-all duration-150",
            value === o.value
              ? "bg-panel-strong text-ink shadow-sm backdrop-blur"
              : "text-ink-faint hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  width = "max-w-md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  width?: string;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const lastActiveRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    lastActiveRef.current = (document.activeElement as HTMLElement) ?? null;
    const node = dialogRef.current;
    const focusables = node
      ? Array.from(
          node.querySelectorAll<HTMLElement>(
            'button, [href], input:not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"])',
          ),
        )
      : [];
    (focusables[0] ?? node)?.focus();
    return () => {
      lastActiveRef.current?.focus?.();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const node = dialogRef.current;
      if (!node) return;
      const focusables = Array.from(
        node.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-[4px] animate-fade-in"
        onClick={onClose}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        tabIndex={-1}
        className={cn(
          "relative w-full rounded-2xl border border-line-strong bg-panel-strong p-6 shadow-2xl animate-modal-in focus:outline-none",
          width,
        )}
      >
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-1 text-ink-faint transition-colors hover:bg-fill hover:text-ink"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
        <div className="mb-4">
          <h3 id="modal-title" className="font-display text-[16px] font-semibold tracking-tight">
            {title}
          </h3>
          {subtitle && <p className="mt-0.5 text-[13px] text-ink-faint">{subtitle}</p>}
        </div>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label>{label}</Label>
      {children}
    </div>
  );
}

let toastRegion: HTMLElement | null = null;

function ensureToastRegion(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  if (toastRegion === null) {
    toastRegion = document.createElement("div");
    toastRegion.setAttribute("role", "status");
    toastRegion.setAttribute("aria-live", "polite");
    toastRegion.setAttribute("aria-atomic", "true");
    document.body.appendChild(toastRegion);
  }
  return toastRegion;
}

// Mount the live region at module load (client only) so assistive tech
// registers it before the first toast's content arrives.
if (typeof document !== "undefined") {
  ensureToastRegion();
}

export function Toast({
  type,
  message,
  onClose,
}: {
  type: "success" | "error" | "info";
  message: string;
  onClose: () => void;
}) {
  const tone =
    type === "success" ? "bg-green" : type === "error" ? "bg-red" : "bg-accent";
  const region = ensureToastRegion();
  if (!region) return null;
  return createPortal(
    <div className="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2">
      <div className="flex items-center gap-3 rounded-full border border-line-strong bg-panel-strong/90 px-4 py-2.5 shadow-[0_12px_40px_var(--color-shadow)] backdrop-blur-xl animate-toast-in glass-edge">
        <span className={cn("h-2 w-2 rounded-full", tone)} />
        <span className="text-[13px] font-medium text-ink">{message}</span>
        <button onClick={onClose} aria-label="Dismiss" className="text-ink-faint hover:text-ink">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
    </div>,
    region,
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-fill">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="text-ink-faint">
          <path d="M3 7h18M3 12h18M3 17h18" />
        </svg>
      </div>
      <p className="text-[14px] font-medium text-ink-soft">{title}</p>
      {hint && <p className="mt-1 text-[12px] text-ink-faint">{hint}</p>}
    </div>
  );
}

export function TrafficLights() {
  return (
    <div className="flex items-center gap-2">
      <span className="h-3 w-3 rounded-full bg-[#ff5f57] shadow-[inset_0_1px_1px_rgba(0,0,0,0.25)]" />
      <span className="h-3 w-3 rounded-full bg-[#febc2e] shadow-[inset_0_1px_1px_rgba(0,0,0,0.25)]" />
      <span className="h-3 w-3 rounded-full bg-[#28c840] shadow-[inset_0_1px_1px_rgba(0,0,0,0.25)]" />
    </div>
  );
}
