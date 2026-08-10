"use client";

import { useEffect, useState } from "react";
import { Card, cn } from "./ui";

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("skeleton rounded-md", className)} />;
}

export function SkeletonText({
  className,
  width = "w-full",
  height = "h-3",
}: {
  className?: string;
  width?: string;
  height?: string;
}) {
  return <Skeleton className={cn(height, width, className)} />;
}

export function Count({
  loading,
  width,
  children,
}: {
  loading: boolean;
  width?: string;
  children: React.ReactNode;
}) {
  if (loading) {
    return <span aria-hidden className={cn("skeleton inline-block", width ?? "h-3 w-16")} />;
  }
  return <span>{children}</span>;
}

export function ErrorState({
  title = "Couldn't load this section",
  hint = "Something went wrong while fetching data. Please try again.",
}: {
  title?: string;
  hint?: string;
}) {
  return (
    <Card className="p-6">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-soft">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            className="text-red"
            strokeWidth="2"
          >
            <path d="M12 8v5M12 16.5h.01" strokeLinecap="round" />
            <circle cx="12" cy="12" r="9" />
          </svg>
        </div>
        <div>
          <p className="text-[13px] font-semibold text-ink">{title}</p>
          <p className="mt-0.5 text-[12px] text-ink-faint">{hint}</p>
        </div>
      </div>
    </Card>
  );
}

export function Async({
  loading,
  error,
  skeleton,
  children,
  delay = 140,
}: {
  loading: boolean;
  error?: boolean;
  skeleton: React.ReactNode;
  children: React.ReactNode;
  delay?: number;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!loading) {
      setVisible(false);
      return;
    }
    const t = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(t);
  }, [loading, delay]);

  if (error) return <ErrorState />;
  if (loading) {
    return <div className={cn(visible ? "animate-fade-in" : "opacity-0")}>{skeleton}</div>;
  }
  return <div className="animate-content-in">{children}</div>;
}
