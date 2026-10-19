"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Modal,
  SectionTitle,
  Select,
  StatusBadge,
  Toast,
  statusTone,
} from "@/components/ui";
import { Async } from "@/components/skeleton";
import { MemberHeaderSkeleton, MemberPanelSkeleton, TimelineSkeleton } from "@/components/skeletons";
import { inr } from "@/lib/mock";
import { COUNTRY_CODES } from "@/lib/countries";
import {
  byId,
  useActivateSubscription,
  useBranches,
  useCheckinMutation,
  useDeleteMember,
  useMemberDetail,
  usePlans,
  useRenewSubscription,
  useUpdateMember,
  useUpgradeSubscription,
  useUploadAvatar,
} from "@/lib/hooks";
import { useCan } from "@/lib/permissions";
import { getAccessToken } from "@/lib/api";
import type { Member } from "@/lib/mock";

function avatarUrl(id: string): string {
  const token = getAccessToken();
  return `/api/v1/members/${id}/avatar?token=${token ?? ""}`;
}

function CountryCodeSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <Select id="member-detail-country-code" aria-label="Country code" value={value} onChange={(e) => onChange(e.target.value)}>
      {COUNTRY_CODES.map((c) => (
        <option key={c.dial} value={c.dial}>
          {c.dial} · {c.iso} · {c.name}
        </option>
      ))}
    </Select>
  );
}

export default function MemberDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [toast, setToast] = useState<{ type: "success" | "error" | "info"; message: string } | null>(null);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    country_code: "+91",
    gender: "Male",
    status: "active",
  });
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [upgradePlanId, setUpgradePlanId] = useState("");
  const [renewOpen, setRenewOpen] = useState(false);
  const [renewStart, setRenewStart] = useState("");
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [fileInput, setFileInput] = useState<HTMLInputElement | null>(null);
  const {
    member,
    subs,
    invoices,
    timeline,
    memberLoading,
    memberError,
    subsLoading,
    subsError,
    timelineLoading,
    timelineError,
  } = useMemberDetail(params.id);
  const { plans } = usePlans();
  const { branches } = useBranches();
  const activate = useActivateSubscription();
  const renew = useRenewSubscription();
  const upgrade = useUpgradeSubscription();
  const checkin = useCheckinMutation();
  const updateMember = useUpdateMember();
  const deleteMember = useDeleteMember();
  const uploadAvatar = useUploadAvatar();
  const can = useCan();

  if (!memberLoading && !member) {
    return (
      <div>
        <EmptyState title="Member not found" hint="They may have been removed." />
        <div className="text-center">
          <Link href="/members" className="text-[13px] font-medium text-accent hover:underline">
            ← Back to members
          </Link>
        </div>
      </div>
    );
  }

  const planMap = byId(plans);
  const branchMap = byId(branches);
  const branch = branchMap.get(member?.branchId ?? "");
  const plan = planMap.get(member?.planId ?? "");
  const sub = subs[0];
  const memberInvoices = invoices;

  function openEdit() {
    if (!member) return;
    setEditForm({
      first_name: member.name.split(" ")[0] ?? "",
      last_name: member.name.split(" ").slice(1).join(" ") ?? "",
      email: member.email,
      phone: member.phone,
      country_code: member.countryCode || "+91",
      gender: member.gender === "—" ? "Male" : member.gender,
      status: member.status,
    });
    setEditing(true);
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!member) return;
    try {
      await updateMember.mutateAsync({
        memberId: member.id,
        body: {
          first_name: editForm.first_name,
          last_name: editForm.last_name || undefined,
          email: editForm.email || undefined,
          phone: editForm.phone || undefined,
          country_code: editForm.country_code,
          gender: editForm.gender,
          status: editForm.status,
        },
      });
      setEditing(false);
      setToast({ type: "success", message: "Member updated" });
    } catch {
      setToast({ type: "error", message: "Could not update member" });
    }
  }

  async function toggleActive(next: boolean) {
    if (!member) return;
    try {
      await updateMember.mutateAsync({ memberId: member.id, body: { is_active: next } });
      setToast({ type: "success", message: next ? `${member.name} enabled` : `${member.name} disabled` });
    } catch {
      setToast({ type: "error", message: "Could not update member" });
    }
  }

  async function confirmDelete() {
    if (!member) return;
    try {
      await deleteMember.mutateAsync(member.id);
      router.push("/members");
    } catch {
      setToast({ type: "error", message: "Could not delete member" });
    }
  }

  async function onAvatarPicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !member) return;
    try {
      await uploadAvatar.mutateAsync({ memberId: member.id, file });
      setToast({ type: "success", message: "Photo updated" });
    } catch {
      setToast({ type: "error", message: "Could not upload photo" });
    }
  }

  async function captureFromCamera() {
    if (!member) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      const video = document.createElement("video");
      video.srcObject = stream;
      video.playsInline = true;
      await video.play();
      const canvas = document.createElement("canvas");
      canvas.width = 640;
      canvas.height = 480;
      canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
      stream.getTracks().forEach((t) => t.stop());
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.9),
      );
      if (!blob) throw new Error("capture failed");
      const file = new File([blob], "capture.jpg", { type: "image/jpeg" });
      await uploadAvatar.mutateAsync({ memberId: member.id, file });
      setToast({ type: "success", message: "Photo captured" });
    } catch {
      setToast({ type: "error", message: "Camera unavailable — upload a photo instead" });
    }
  }

  async function activateSub() {
    if (!sub) return;
    try {
      await activate.mutateAsync(sub.id);
      setToast({ type: "success", message: "Subscription activated" });
    } catch {
      setToast({ type: "error", message: "Could not activate subscription" });
    }
  }

  function openRenew() {
    if (!sub) return;
    setRenewStart(sub.endAtIso ? sub.endAtIso.slice(0, 10) : "");
    setRenewOpen(true);
  }

  async function confirmRenew(e: React.FormEvent) {
    e.preventDefault();
    if (!sub) return;
    try {
      await renew.mutateAsync({
        id: sub.id,
        start_at: renewStart ? new Date(`${renewStart}T00:00:00`).toISOString() : undefined,
      });
      setRenewOpen(false);
      setToast({ type: "success", message: "Subscription renewed" });
    } catch {
      setToast({ type: "error", message: "Could not renew subscription" });
    }
  }

  async function confirmUpgrade(e: React.FormEvent) {
    e.preventDefault();
    if (!sub || !upgradePlanId) return;
    try {
      await upgrade.mutateAsync({ subscriptionId: sub.id, planId: upgradePlanId });
      setUpgradeOpen(false);
      setUpgradePlanId("");
      setToast({ type: "success", message: "Plan upgraded" });
    } catch {
      setToast({ type: "error", message: "Could not upgrade plan" });
    }
  }

  async function checkInNow() {
    if (!member || !member.branchId) return;
    try {
      const result = await checkin.mutateAsync({
        member_id: member.id,
        branch_id: member.branchId,
        source: "manual",
      });
      setToast({
        type: result.result === "allowed" ? "success" : result.result === "duplicate" ? "info" : "error",
        message:
          result.result === "allowed"
            ? `${member.name} checked in`
            : `Check-in ${result.result} · ${result.reason ?? ""}`,
      });
    } catch {
      setToast({ type: "error", message: "Could not check in" });
    }
  }

  return (
    <div className="space-y-6">
      <Link href="/members" className="inline-flex items-center gap-1 text-[13px] font-medium text-accent hover:underline">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
          <path d="M15 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Members
      </Link>

      <Async loading={memberLoading} error={memberError} skeleton={<MemberHeaderSkeleton />}>
        {member && (
          <Card className="p-6">
            <div className="flex flex-wrap items-start gap-5">
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setAvatarOpen(true)}
                  className="block rounded-full transition-opacity hover:opacity-90"
                  title="View photo"
                  aria-label="View photo"
                >
                  <Avatar name={member.name} size="lg" src={member.avatarPath ? avatarUrl(member.id) : null} />
                </button>
                {can("members.update") && (
                  <button
                    type="button"
                    onClick={() => fileInput?.click()}
                    className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-ink text-accent-ink shadow-md hover:bg-accent"
                    title="Upload photo"
                    aria-label="Upload photo"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                      <path d="M12 5v14M5 12h14" strokeLinecap="round" />
                    </svg>
                  </button>
                )}
                <input
                  ref={(el) => setFileInput(el)}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={onAvatarPicked}
                />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="text-[22px] font-semibold tracking-tight">{member.name}</h2>
                  {member.isActive ? (
                    <StatusBadge status={member.status} />
                  ) : (
                    <Badge tone="red">Disabled</Badge>
                  )}
                  {member.tags.map((t) => (
                    <Badge key={t} tone={t === "PLATINUM" ? "blue" : t === "OVERDUE" ? "red" : "gray"}>
                      {t}
                    </Badge>
                  ))}
                </div>
                <p className="mt-1 text-[13px] text-ink-faint">{member.email}</p>
                <div className="mt-3 flex flex-wrap gap-4 text-[13px]">
                  <span className="text-ink-soft">
                    {member.phone
                      ? member.phone.startsWith("+")
                        ? member.phone
                        : `${member.countryCode || "+91"} ${member.phone}`.trim()
                      : "—"}
                  </span>
                  <span className="text-ink-faint">•</span>
                  <span className="text-ink-soft">{member.gender} · {member.age > 0 ? member.age : "—"}</span>
                  <span className="text-ink-faint">•</span>
                  <span className="text-ink-soft">{branch?.name}</span>
                </div>
                {sub && (
                  <div className="mt-3 flex flex-wrap gap-4 text-[12px] text-ink-faint">
                    <span>Membership: {sub.startAt} – {sub.endAt}</span>
                  </div>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {can("members.update") && (
                  <Button variant="secondary" onClick={openEdit}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
                    </svg>
                    Edit
                  </Button>
                )}
                {can("members.update") &&
                  (member.isActive ? (
                    <Button variant="secondary" onClick={() => toggleActive(false)}>Disable</Button>
                  ) : (
                    <Button variant="secondary" onClick={() => toggleActive(true)}>Enable</Button>
                  ))}
                {can("members.checkin") && (
                  <Button onClick={checkInNow} disabled={checkin.isPending}>
                    {checkin.isPending ? "Checking in…" : "Check in"}
                  </Button>
                )}
                {can("members.delete") && (
                  <Button variant="secondary" className="text-red hover:text-red" onClick={() => setDeleteOpen(true)}>
                    Delete
                  </Button>
                )}
              </div>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-4 border-t border-line pt-5 sm:grid-cols-4">
              {[
                { label: "Total visits", value: String(member.visits) },
                { label: "Current streak", value: `${member.streak} days` },
                { label: "Member since", value: member.joinedAt },
                { label: "Last check-in", value: member.lastCheckIn ?? "—" },
              ].map((s) => (
                <div key={s.label}>
                  <p className="text-[12px] text-ink-faint">{s.label}</p>
                  <p className="mt-0.5 text-[16px] font-semibold">{s.value}</p>
                </div>
              ))}
            </div>
          </Card>
        )}
      </Async>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="p-5">
          <SectionTitle title="Subscription" action={plan ? <Badge tone={statusTone(sub?.status ?? "lead")}>{sub?.status}</Badge> : undefined} />
          <Async loading={subsLoading} error={subsError} skeleton={<MemberPanelSkeleton />}>
            {sub ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between rounded-xl bg-fill px-4 py-3 glass-edge">
                  <div>
                    <p className="font-medium">{plan?.name}</p>
                    <p className="text-[12px] text-ink-faint">
                      {sub.startAt}
                      {" – "}
                      {sub.endAt}
                    </p>
                  </div>
                  <span className="text-[16px] font-semibold">{inr(sub.price)}</span>
                </div>
                {sub.status === "pending" && can("membership.subscriptions.activate") && (
                  <Button className="w-full" onClick={activateSub}>
                    Activate subscription
                  </Button>
                )}
                {sub.status === "active" && (
                  <div className="flex gap-2">
                    <Button variant="secondary" className="flex-1" onClick={openRenew} disabled={renew.isPending}>
                      {renew.isPending ? "Renewing…" : "Renew"}
                    </Button>
                    <Button
                      variant="secondary"
                      className="flex-1"
                      onClick={() => {
                        setUpgradePlanId(plan?.id ?? "");
                        setUpgradeOpen(true);
                      }}
                    >
                      Upgrade plan
                    </Button>
                  </div>
                )}
                <p className="text-[12px] text-ink-faint">
                  {plan?.autoRenew ? "Auto-renews · cancel anytime" : "Manual renewal · expires on the end date"}
                </p>
              </div>
            ) : (
              <EmptyState title="No active subscription" hint="Assign a plan to get started." />
            )}
          </Async>
        </Card>

        <Card className="p-5">
          <SectionTitle title="Invoices" />
          <Async loading={memberLoading} error={memberError} skeleton={<MemberPanelSkeleton />}>
            {memberInvoices.length ? (
              <div className="space-y-2">
                {memberInvoices.map((inv) => (
                  <Link
                    key={inv.id}
                    href={`/billing/${inv.id}`}
                    className="flex items-center justify-between rounded-lg border border-line px-3.5 py-2.5 hover:bg-accent-soft/40 transition-colors"
                  >
                    <div>
                      <p className="text-[13px] font-medium">{inv.number}</p>
                      <p className="text-[12px] text-ink-faint">Due {inv.dueDate}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-[13px] font-semibold">{inr(inv.total)}</span>
                      <StatusBadge status={inv.status} />
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyState title="No invoices" />
            )}
          </Async>
        </Card>
      </div>

      <Card className="p-5">
        <SectionTitle title="Timeline" />
        <Async loading={timelineLoading} error={timelineError} skeleton={<TimelineSkeleton rows={4} />}>
          <div className="relative space-y-0 pl-5">
            <span className="absolute bottom-2 left-[7px] top-2 w-px bg-line-strong" />
            {timeline.map((t, i) => (
              <div key={t.id} className="relative flex gap-4 pb-5">
                <span
                  className={`absolute -left-5 top-1 h-3.5 w-3.5 rounded-full border-2 border-elevated ${
                    i === 0 ? "bg-accent shadow-[0_0_10px_var(--color-glow-strong)]" : "bg-fill-strong"
                  }`}
                />
                <div>
                  <p className="text-[13px] font-medium">{t.action}</p>
                  <p className="text-[12px] text-ink-faint">{t.detail}</p>
                </div>
                <span className="ml-auto text-[12px] text-ink-faint">{t.time}</span>
              </div>
            ))}
          </div>
        </Async>
      </Card>

      <Modal open={editing} onClose={() => setEditing(false)} title="Edit member" subtitle={member?.name}>
        <form onSubmit={saveEdit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="First name">
              <Input
                required
                id="member-edit-first-name"
                aria-label="First name"
                value={editForm.first_name}
                onChange={(e) => setEditForm({ ...editForm, first_name: e.target.value })}
              />
            </Field>
            <Field label="Last name">
              <Input
                id="member-edit-last-name"
                aria-label="Last name"
                value={editForm.last_name}
                onChange={(e) => setEditForm({ ...editForm, last_name: e.target.value })}
              />
            </Field>
          </div>
          <Field label="Email">
            <Input
              type="email"
              id="member-edit-email"
              aria-label="Email"
              value={editForm.email}
              onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Country code">
              <CountryCodeSelect
                value={editForm.country_code}
                onChange={(v) => setEditForm({ ...editForm, country_code: v })}
              />
            </Field>
            <Field label="Phone number">
              <Input
                id="member-edit-phone"
                aria-label="Phone number"
                value={editForm.phone}
                onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
              />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Gender">
              <Select
                id="member-edit-gender"
                aria-label="Gender"
                value={editForm.gender}
                onChange={(e) => setEditForm({ ...editForm, gender: e.target.value })}
              >
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </Select>
            </Field>
            <Field label="Status">
              <Select
                id="member-edit-status"
                aria-label="Status"
                value={editForm.status}
                onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
              >
                <option value="lead">Lead</option>
                <option value="prospect">Prospect</option>
                <option value="active">Active</option>
                <option value="frozen">Frozen</option>
                <option value="lapsed">Lapsed</option>
                <option value="cancelled">Cancelled</option>
              </Select>
            </Field>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setEditing(false)}>Cancel</Button>
            <Button type="submit" disabled={updateMember.isPending}>
              {updateMember.isPending ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={upgradeOpen}
        onClose={() => setUpgradeOpen(false)}
        title="Upgrade plan"
        subtitle={`Choose a new plan for ${member?.name ?? ""}`}
      >
        <form onSubmit={confirmUpgrade} className="space-y-4">
          <Field label="New plan">
            <Select
              required
              id="member-edit-new-plan"
              aria-label="New plan"
              value={upgradePlanId}
              onChange={(e) => setUpgradePlanId(e.target.value)}
            >
              <option value="">Select a plan…</option>
              {plans
                .filter((p) => p.isActive && p.id !== plan?.id)
                .map((p) => (
                  <option key={p.id} value={p.id}>{p.name} · {inr(p.price)}</option>
                ))}
            </Select>
          </Field>
          <p className="text-[12px] text-ink-faint">
            The subscription switches to the new plan immediately and is billed at its price.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setUpgradeOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={upgrade.isPending}>
              {upgrade.isPending ? "Upgrading…" : "Upgrade plan"}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={renewOpen}
        onClose={() => setRenewOpen(false)}
        title="Renew subscription"
        subtitle={sub ? `${plan?.name ?? ""} · renews for ${inr(sub.price)}` : undefined}
      >
        <form onSubmit={confirmRenew} className="space-y-4">
          <Field label="Start date">
            <Input
              type="date"
              required
              id="member-edit-start-date"
              aria-label="Start date"
              value={renewStart}
              onChange={(e) => setRenewStart(e.target.value)}
            />
          </Field>
          <p className="text-[12px] text-ink-faint">
            Prefilled with the current membership end date for a regular renewal. Set an earlier date if the member rejoined.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setRenewOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={renew.isPending}>
              {renew.isPending ? "Renewing…" : "Renew"}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={avatarOpen}
        onClose={() => setAvatarOpen(false)}
        title={member?.avatarPath ? member?.name : `Add photo · ${member?.name ?? ""}`}
        subtitle={member?.avatarPath ? undefined : "No photo yet — capture or upload one"}
      >
        {member?.avatarPath ? (
          <div className="space-y-4">
            <div className="mx-auto flex h-48 w-48 items-center justify-center overflow-hidden rounded-full">
              <img src={avatarUrl(member.id)} alt={member.name} className="h-full w-full object-cover" />
            </div>
            {can("members.update") && (
              <div className="flex justify-center gap-2">
                <Button type="button" variant="secondary" onClick={captureFromCamera}>Retake</Button>
                <Button type="button" variant="secondary" onClick={() => fileInput?.click()}>Upload new</Button>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="mx-auto flex h-48 w-48 items-center justify-center overflow-hidden rounded-full bg-fill">
              <Avatar name={member?.name ?? "?"} size="lg" />
            </div>
            {can("members.update") && (
              <div className="flex justify-center gap-2">
                <Button type="button" variant="secondary" onClick={captureFromCamera}>Capture</Button>
                <Button type="button" variant="secondary" onClick={() => fileInput?.click()}>Upload</Button>
              </div>
            )}
          </div>
        )}
        <div className="flex justify-end pt-2">
          <Button type="button" variant="secondary" onClick={() => setAvatarOpen(false)}>Close</Button>
        </div>
      </Modal>

      <Modal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title={`Delete ${member?.name ?? ""}?`}
        subtitle="This member and their records will be removed"
      >
        <p className="text-[13px] text-ink-soft">
          Deleting {member?.name ?? "this member"} removes them from the roster permanently. This cannot be undone.
        </p>
        <div className="flex justify-end gap-2 pt-4">
          <Button type="button" variant="secondary" onClick={() => setDeleteOpen(false)}>Cancel</Button>
          <Button type="button" variant="danger" disabled={deleteMember.isPending} onClick={confirmDelete}>
            Delete member
          </Button>
        </div>
      </Modal>

      {toast && <Toast type={toast.type} message={toast.message} onClose={() => setToast(null)} />}
    </div>
  );
}
