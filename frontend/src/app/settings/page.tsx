"use client";

import { useState } from "react";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import { RequireAuth } from "@/components/RequireAuth";
import { useAuth } from "@/lib/auth";
import { Button, Card, PageHeader } from "@/components/ui";
import { ConnectedApps } from "@/components/ConnectedApps";

function SettingsPage() {
  const { claims, logout } = useAuth();
  const [exported, setExported] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmErase, setConfirmErase] = useState(false);
  const [busy, setBusy] = useState(false);

  async function exportData() {
    setBusy(true);
    setError(null);
    try {
      const data = await api.get("/users/me/export-data");
      setExported(JSON.stringify(data, null, 2));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Export failed.");
    } finally {
      setBusy(false);
    }
  }

  function downloadExport() {
    if (!exported) return;
    const blob = new Blob([exported], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "my-data-export.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function eraseAccount() {
    setBusy(true);
    setError(null);
    try {
      await api.post("/users/me/request-erasure");
      logout();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erasure failed.");
      setBusy(false);
    }
  }

  return (
    <div className="max-w-6xl mx-auto mt-10 px-6 *:max-w-xl pb-16">
      <PageHeader title="Account & Privacy" />

      <Card className="mb-6">
        <h2 className="text-sm font-semibold mb-1">Profile</h2>
        <p className="text-sm text-muted">{claims?.email}</p>
      </Card>

      {claims?.organizationId && (
        <Card className="mb-6">
          <h2 className="text-sm font-semibold mb-1">Team members</h2>
          <p className="text-xs text-muted mb-3">Invite people, change roles, and disable access for your organization.</p>
          <Link href="/settings/team" className="text-primary hover:underline text-sm font-medium">
            Manage team members →
          </Link>
        </Card>
      )}

      {claims?.organizationId && <ConnectedApps />}

      <Card className="mb-6">
        <h2 className="text-sm font-semibold mb-2">Export my data</h2>
        <p className="text-xs text-muted mb-3">
          Downloads your own profile, organization memberships, and your own audit-log history — the data NDPA/NDPR
          gives you a right to access. This does not include your organization&apos;s business records (employees,
          customers, transactions) — those belong to the organization, not to this personal export.
        </p>
        <Button variant="secondary" onClick={exportData} disabled={busy}>
          {busy ? "Exporting…" : "Export my data"}
        </Button>
        {exported && (
          <div className="mt-3">
            <button onClick={downloadExport} className="text-primary hover:underline text-sm mr-3">
              Download as JSON
            </button>
            <pre className="text-xs bg-surface-muted p-3 rounded-lg mt-2 overflow-x-auto max-h-64 overflow-y-auto">{exported}</pre>
          </div>
        )}
      </Card>

      <Card className="border-danger-border">
        <h2 className="text-sm font-semibold mb-2 text-danger">Request erasure</h2>
        <p className="text-xs text-muted mb-3">
          Anonymizes your name and email on this account and deactivates it — this cannot be undone. Your
          organization&apos;s tax/business records are retained as required by law; this only affects your personal
          profile. See the Terms &amp; Conditions for the full policy.
        </p>
        {!confirmErase ? (
          <Button variant="secondary" className="!text-danger !border-danger-border" onClick={() => setConfirmErase(true)}>
            Request account erasure
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button variant="danger" onClick={eraseAccount} disabled={busy}>
              {busy ? "Erasing…" : "Confirm — erase my account"}
            </Button>
            <Button variant="ghost" onClick={() => setConfirmErase(false)}>
              Cancel
            </Button>
          </div>
        )}
      </Card>

      {error && <p className="text-danger text-sm mt-4">{error}</p>}
    </div>
  );
}

export default function Page() {
  return (
    <RequireAuth requireOrganization={false}>
      <SettingsPage />
    </RequireAuth>
  );
}
