"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { RequireAuth } from "@/components/RequireAuth";
import { useAuth } from "@/lib/auth";
import { Badge, Button, Input, PageHeader, Select, Table, Thead, Th, Td, Tr, Card } from "@/components/ui";

// Plain-English description per role — shown in the invite form's role select so an inviter
// doesn't have to guess what a role name implies. PLATFORM_ADMIN is deliberately absent: it
// is never an organization role (enforced server-side too — see OrganizationsService.assertCanGrantRole).
const ROLE_OPTIONS: { value: string; label: string; description: string }[] = [
  { value: "COMPANY_OWNER", label: "Company Owner", description: "Full control, including managing other owners." },
  { value: "COMPANY_ADMIN", label: "Company Admin", description: "Full control over day-to-day operations." },
  { value: "ACCOUNTANT", label: "Accountant", description: "Records transactions, reconciles bank statements, prepares tax returns." },
  { value: "AUDITOR", label: "Auditor", description: "Runs audits and views everything, without changing financial records." },
  { value: "TAX_OFFICER", label: "Tax Officer", description: "Calculates and files taxes." },
  { value: "FINANCE_MANAGER", label: "Finance Manager", description: "Approves transactions, adjustments, and tax filings." },
  { value: "MANAGEMENT_APPROVER", label: "Management Approver", description: "Approves transactions and filings, without day-to-day access." },
  { value: "EMPLOYEE", label: "Employee", description: "Can view transactions only." },
  { value: "READ_ONLY", label: "Read Only", description: "View-only access to transactions, tax history, and reports." },
];

interface Member {
  membershipId: string;
  email: string;
  fullName: string;
  roleName: string;
  status: "ACTIVE" | "INVITED" | "DISABLED";
  joinedAt: string | null;
  invitationId: string | null;
  invitedAt: string | null;
  inviteExpiresAt: string | null;
  isInviteExpired: boolean;
  invitedByName: string | null;
}

function statusLabel(m: Member): string {
  if (m.status === "INVITED" && m.isInviteExpired) return "Expired";
  if (m.status === "INVITED") return "Invited";
  if (m.status === "DISABLED") return "Disabled";
  return "Active";
}

function roleLabel(roleName: string): string {
  return ROLE_OPTIONS.find((r) => r.value === roleName)?.label ?? roleName;
}

export function TeamPage() {
  const { claims } = useAuth();
  const [members, setMembers] = useState<Member[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);

  function reload() {
    api
      .get<{ members: Member[] }>("/organizations/me/members")
      .then((res) => setMembers(res.members))
      .catch((err) => {
        setMembers([]);
        if (err instanceof ApiError && err.status === 403) setForbidden(true);
        else setError(err instanceof ApiError ? err.message : "Failed to load team members.");
      });
  }
  useEffect(reload, []);

  // Only a COMPANY_OWNER can grant COMPANY_OWNER (enforced server-side regardless) — hide
  // it from the role picker for everyone else so the common case doesn't offer a choice
  // that would just come back as an error.
  const grantableRoles = ROLE_OPTIONS.filter((r) => r.value !== "COMPANY_OWNER" || claims?.roleName === "COMPANY_OWNER");

  return (
    <div className="max-w-3xl mx-auto mt-10 px-4 pb-16">
      <PageHeader title="Team members" />

      {forbidden ? (
        <p className="text-sm text-muted">Only a company owner or admin can manage team members.</p>
      ) : (
        <>
          <InviteForm roles={grantableRoles} onInvited={reload} />
          {error && <p className="text-danger text-sm mb-3">{error}</p>}
          {members && <MemberTable members={members} onChanged={reload} />}
        </>
      )}
    </div>
  );
}

function InviteForm({ roles, onInvited }: { roles: typeof ROLE_OPTIONS; onInvited: () => void }) {
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [roleName, setRoleName] = useState(roles[0]?.value ?? "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [acceptUrl, setAcceptUrl] = useState<string | null>(null);
  const [invitedEmail, setInvitedEmail] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setAcceptUrl(null);
    setIsSubmitting(true);
    try {
      const res = await api.post<{ acceptUrl: string | null; email: string }>("/organizations/me/invitations", { email, fullName, roleName });
      setEmail("");
      setFullName("");
      if (res.acceptUrl) {
        setAcceptUrl(res.acceptUrl);
        setInvitedEmail(res.email);
      }
      onInvited();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to send the invitation.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function copyLink() {
    if (!acceptUrl) return;
    try {
      await navigator.clipboard.writeText(acceptUrl);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Card className="mb-6">
      <h2 className="text-sm font-semibold mb-3">Invite someone</h2>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="invite-email" className="text-xs font-medium text-muted">
            Email
          </label>
          <Input id="invite-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required maxLength={254} />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="invite-name" className="text-xs font-medium text-muted">
            Full name
          </label>
          <Input id="invite-name" type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} required maxLength={200} />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="invite-role" className="text-xs font-medium text-muted">
            Role
          </label>
          <Select id="invite-role" value={roleName} onChange={(e) => setRoleName(e.target.value)} required>
            {roles.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </Select>
          <p className="text-xs text-muted mt-1">{roles.find((r) => r.value === roleName)?.description}</p>
        </div>

        {error && <p className="text-danger text-sm">{error}</p>}
        <Button type="submit" disabled={isSubmitting} className="self-start">
          {isSubmitting ? "Sending…" : "Send invite"}
        </Button>
      </form>

      {acceptUrl && (
        <div className="bg-warning-surface border border-warning-border rounded-lg p-3 mt-4 text-xs text-warning-foreground">
          <p className="font-semibold mb-1">Email delivery isn&apos;t configured — deliver this link to {invitedEmail} yourself.</p>
          <p className="mb-2">Share this link only with {invitedEmail} — anyone who has it can accept the invitation.</p>
          <code className="block break-all bg-surface text-foreground rounded p-2 font-mono">{acceptUrl}</code>
          <button onClick={copyLink} className="mt-2 underline font-medium">
            {copied ? "Copied" : "Copy link"}
          </button>
        </div>
      )}
    </Card>
  );
}

function MemberTable({ members, onChanged }: { members: Member[]; onChanged: () => void }) {
  return (
    <Table>
      <Thead>
        <tr>
          <Th>Name</Th>
          <Th>Email</Th>
          <Th>Role</Th>
          <Th>Status</Th>
          <Th>Date</Th>
          <Th>Actions</Th>
        </tr>
      </Thead>
      <tbody>
        {members.map((m) => (
          <MemberRow key={m.membershipId} member={m} onChanged={onChanged} />
        ))}
      </tbody>
    </Table>
  );
}

function MemberRow({ member, onChanged }: { member: Member; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingRole, setEditingRole] = useState(false);
  const [newRole, setNewRole] = useState(member.roleName);
  const [confirmingDisable, setConfirmingDisable] = useState(false);
  const [confirmingRevoke, setConfirmingRevoke] = useState(false);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Action failed.");
    } finally {
      setBusy(false);
    }
  }

  const dateLabel =
    member.status === "ACTIVE" && member.joinedAt
      ? `Joined ${new Date(member.joinedAt).toLocaleDateString()}`
      : member.invitedAt
        ? `Invited ${new Date(member.invitedAt).toLocaleDateString()}`
        : "—";

  return (
    <>
      <Tr>
        <Td>{member.fullName}</Td>
        <Td>{member.email}</Td>
        <Td>
          {editingRole ? (
            <div className="flex items-center gap-1">
              <Select value={newRole} onChange={(e) => setNewRole(e.target.value)} className="text-xs py-1">
                {ROLE_OPTIONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </Select>
              <button
                className="text-primary text-xs underline"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    await api.patch(`/organizations/me/members/${member.membershipId}`, { roleName: newRole });
                    setEditingRole(false);
                  })
                }
              >
                Save
              </button>
              <button className="text-muted text-xs underline" onClick={() => setEditingRole(false)}>
                Cancel
              </button>
            </div>
          ) : (
            roleLabel(member.roleName)
          )}
        </Td>
        <Td>
          <Badge tone={member.status === "ACTIVE" ? "success" : member.status === "DISABLED" ? "danger" : "warning"}>{statusLabel(member)}</Badge>
        </Td>
        <Td className="text-xs text-muted">{dateLabel}</Td>
        <Td>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {member.status === "ACTIVE" && !editingRole && (
              <button className="text-primary underline" onClick={() => setEditingRole(true)}>
                Change role
              </button>
            )}
            {member.status === "ACTIVE" &&
              (confirmingDisable ? (
                <>
                  <button className="text-danger underline" disabled={busy} onClick={() => run(() => api.post(`/organizations/me/members/${member.membershipId}/disable`))}>
                    Confirm disable
                  </button>
                  <button className="text-muted underline" onClick={() => setConfirmingDisable(false)}>
                    Cancel
                  </button>
                </>
              ) : (
                <button className="text-danger underline" onClick={() => setConfirmingDisable(true)}>
                  Disable
                </button>
              ))}
            {member.status === "DISABLED" && (
              <button className="text-primary underline" disabled={busy} onClick={() => run(() => api.post(`/organizations/me/members/${member.membershipId}/enable`))}>
                Enable
              </button>
            )}
            {member.status === "INVITED" && member.invitationId && (
              <>
                <button
                  className="text-primary underline"
                  disabled={busy}
                  onClick={() => run(() => api.post(`/organizations/me/invitations/${member.invitationId}/resend`))}
                >
                  Resend
                </button>
                {confirmingRevoke ? (
                  <>
                    <button
                      className="text-danger underline"
                      disabled={busy}
                      onClick={() => run(() => api.post(`/organizations/me/invitations/${member.invitationId}/revoke`))}
                    >
                      Confirm revoke
                    </button>
                    <button className="text-muted underline" onClick={() => setConfirmingRevoke(false)}>
                      Cancel
                    </button>
                  </>
                ) : (
                  <button className="text-danger underline" onClick={() => setConfirmingRevoke(true)}>
                    Revoke
                  </button>
                )}
              </>
            )}
          </div>
        </Td>
      </Tr>
      {error && (
        <tr>
          <Td colSpan={6} className="text-danger text-xs">
            {error}
          </Td>
        </tr>
      )}
    </>
  );
}

export default function Page() {
  return (
    <RequireAuth>
      <TeamPage />
    </RequireAuth>
  );
}
