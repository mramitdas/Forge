"use client";

import { useMemo, useState } from "react";
import { Badge, Button, Card, EmptyState, Segmented, Toast } from "@/components/ui";
import { Async, Count } from "@/components/skeleton";
import { NotificationListSkeleton } from "@/components/skeletons";
import { type Notification } from "@/lib/mock";
import { useMarkAllNotificationsRead, useMarkNotificationRead, useNotificationsPage } from "@/lib/hooks";
import { useCan } from "@/lib/permissions";
import { PageSizeSelect } from "@/components/page-size-select";
import { usePageSize } from "@/lib/use-page-size";

const typeIcon: Record<Notification["type"], React.ReactNode> = {
  payment: (
    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-green-soft">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-green" strokeWidth="2">
        <rect x="3" y="6" width="18" height="13" rx="2" />
        <path d="M3 10h18" />
      </svg>
    </div>
  ),
  checkin: (
    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-soft">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-blue" strokeWidth="2">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3.5 2" strokeLinecap="round" />
      </svg>
    </div>
  ),
  renewal: (
    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-soft">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-amber" strokeWidth="2">
        <path d="M4 6h16M4 12h16M4 18h10" strokeLinecap="round" />
        <circle cx="18" cy="18" r="3" />
      </svg>
    </div>
  ),
  system: (
    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-fill">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-ink-faint" strokeWidth="2">
        <path d="M12 9v4M12 17h.01" strokeLinecap="round" />
        <circle cx="12" cy="12" r="9" />
      </svg>
    </div>
  ),
};

export default function NotificationsPage() {
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = usePageSize("notifications");
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  function notify(message: string, type: "success" | "error" = "success") {
    setToast({ message, type });
  }
  const { notifications, total, unread, isLoading, isError } = useNotificationsPage({ page, pageSize });
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const markRead = useMarkNotificationRead();
  const markAllMutation = useMarkAllNotificationsRead();
  const can = useCan();
  const [isMarkingAll, setMarkingAll] = useState(false);

  const list = useMemo(
    () => (filter === "all" ? notifications : notifications.filter((n) => !n.read)),
    [filter, notifications],
  );

  async function markAll() {
    if (isMarkingAll) return;
    setMarkingAll(true);
    try {
      await markAllMutation.mutateAsync();
      notify("All notifications marked as read");
    } catch {
      notify("Could not mark notifications as read", "error");
    } finally {
      setMarkingAll(false);
    }
  }

  function markOne(n: Notification) {
    if (n.read) return;
    markRead.mutate(n.id, {
      onSuccess: () => notify("Notification marked as read"),
      onError: () => notify("Could not mark notification as read", "error"),
    });
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <Segmented
          options={[
            { value: "all", label: "All" },
            {
              value: "unread",
              label: (
                <span className="inline-flex items-center gap-1">
                  Unread{" "}
                  <Count loading={isLoading} width="h-3 w-6">
                    ({unread})
                  </Count>
                </span>
              ),
            },
          ]}
          value={filter}
          onChange={(v) => { setFilter(v as "all" | "unread"); setPage(1); }}
        />
        {can("notifications.view") && (
          <Button variant="ghost" size="sm" onClick={markAll} disabled={unread === 0 || isMarkingAll}>
            Mark all read
          </Button>
        )}
      </div>

      <Async loading={isLoading} error={isError} skeleton={<NotificationListSkeleton rows={6} />}>
        <Card className="divide-y divide-line">
          {list.map((n) => (
            <button
              key={n.id}
              onClick={() => markOne(n)}
              className="flex w-full items-start gap-3.5 px-5 py-4 text-left transition-colors hover:bg-accent-soft/30"
            >
              {typeIcon[n.type]}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-[13px] font-medium">{n.title}</p>
                  {!n.read && <span className="h-2 w-2 rounded-full bg-accent" />}
                </div>
                <p className="mt-0.5 text-[13px] text-ink-soft">{n.message}</p>
                <p className="mt-1 text-[11px] text-ink-faint">{n.time}</p>
              </div>
              <Badge tone="gray">{n.type}</Badge>
            </button>
          ))}
          {list.length === 0 && (
            <EmptyState title="You're all caught up" hint="No notifications match this view." />
          )}
        </Card>
      </Async>

      {list.length > 0 && (
        <div className="flex items-center justify-between px-1">
          <span className="text-[12px] text-ink-faint">
            Page {page} of {totalPages}
          </span>
          <div className="flex items-center gap-2">
            <PageSizeSelect
              value={pageSize}
              onChange={(n) => { setPageSize(n); setPage(1); }}
            />
            <Button variant="secondary" size="xs" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <Button variant="secondary" size="xs" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              Next
            </Button>
          </div>
        </div>
      )}

      {toast && <Toast type={toast.type} message={toast.message} onClose={() => setToast(null)} />}
    </div>
  );
}
