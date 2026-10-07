"use client";

import { useState } from "react";
import { api, ApiError } from "@/lib/api";
import { RequireAuth } from "@/components/RequireAuth";
import { useAuth } from "@/lib/auth";

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
    <div className="max-w-xl mx-auto mt-10 px-4 pb-16">
      <h1 className="text-lg font-semibold mb-6">Account &amp; Privacy</h1>

      <section className="border rounded p-4 mb-6">
        <h2 className="text-sm font-semibold mb-1">Profile</h2>
        <p className="text-sm text-gray-500">{claims?.email}</p>
      </section>

      <section className="border rounded p-4 mb-6">
        <h2 className="text-sm font-semibold mb-2">Export my data</h2>
        <p className="text-xs text-gray-500 mb-3">
          Downloads your own profile, organization memberships, and your own audit-log history — the data NDPA/NDPR
          gives you a right to access. This does not include your organization&apos;s business records (employees,
          customers, transactions) — those belong to the organization, not to this personal export.
        </p>
        <button onClick={exportData} disabled={busy} className="bg-black text-white rounded px-3 py-2 text-sm disabled:opacity-50">
          {busy ? "Exporting…" : "Export my data"}
        </button>
        {exported && (
          <div className="mt-3">
            <button onClick={downloadExport} className="text-blue-600 hover:underline text-sm mr-3">
              Download as JSON
            </button>
            <pre className="text-xs bg-gray-50 dark:bg-gray-900 p-3 rounded mt-2 overflow-x-auto max-h-64 overflow-y-auto">{exported}</pre>
          </div>
        )}
      </section>

      <section className="border border-red-300 dark:border-red-800 rounded p-4">
        <h2 className="text-sm font-semibold mb-2 text-red-700 dark:text-red-400">Request erasure</h2>
        <p className="text-xs text-gray-500 mb-3">
          Anonymizes your name and email on this account and deactivates it — this cannot be undone. Your
          organization&apos;s tax/business records are retained as required by law; this only affects your personal
          profile. See the Terms &amp; Conditions for the full policy.
        </p>
        {!confirmErase ? (
          <button onClick={() => setConfirmErase(true)} className="text-red-700 dark:text-red-400 border border-red-300 dark:border-red-800 rounded px-3 py-2 text-sm">
            Request account erasure
          </button>
        ) : (
          <div className="flex gap-2">
            <button onClick={eraseAccount} disabled={busy} className="bg-red-700 text-white rounded px-3 py-2 text-sm disabled:opacity-50">
              {busy ? "Erasing…" : "Confirm — erase my account"}
            </button>
            <button onClick={() => setConfirmErase(false)} className="text-sm text-gray-500">
              Cancel
            </button>
          </div>
        )}
      </section>

      {error && <p className="text-red-600 text-sm mt-4">{error}</p>}
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
