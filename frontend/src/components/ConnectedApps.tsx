"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { Button, Card, Input, Select } from "@/components/ui";

interface Company {
  id: string;
  name: string;
}

interface Connection {
  id: string;
  label: string;
  keyPrefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

/**
 * Lets a company's owner/admin link an external system (e.g. the Netwave billing
 * dashboard) by issuing a connection key. The key is shown exactly once — the server keeps
 * only its hash — so a lost key is revoked and replaced, never recovered.
 */
export function ConnectedApps() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setCompanyId] = useState("");
  const [connections, setConnections] = useState<Connection[] | null>(null);
  const [label, setLabel] = useState("Netwave billing dashboard");
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .get<Company[]>("/companies")
      .then((list) => {
        setCompanies(list);
        if (list.length > 0) setCompanyId(list[0].id);
      })
      .catch(() => setCompanies([]));
  }, []);

  function reload(id: string) {
    api
      .get<Connection[]>(`/companies/${id}/integrations`)
      .then(setConnections)
      .catch((err) => {
        setConnections([]);
        setError(err instanceof ApiError && err.status === 403 ? "Only a company owner or admin can manage connected apps." : "Failed to load connected apps.");
      });
  }

  useEffect(() => {
    if (companyId) reload(companyId);
  }, [companyId]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setCopied(false);
    try {
      const res = await api.post<{ key: string }>(`/companies/${companyId}/integrations`, { label });
      setNewKey(res.key);
      reload(companyId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create the connection key.");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(connectionId: string) {
    setError(null);
    try {
      await api.post(`/companies/${companyId}/integrations/${connectionId}/revoke`);
      reload(companyId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to revoke the key.");
    }
  }

  async function copyKey() {
    if (!newKey) return;
    try {
      await navigator.clipboard.writeText(newKey);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  if (companies.length === 0) return null;

  return (
    <Card className="mb-6">
      <h2 className="text-sm font-semibold mb-1">Connected apps</h2>
      <p className="text-xs text-muted mb-3">
        Link another system, such as your Netwave billing dashboard, so it can show this company&apos;s deadlines and
        open Netwave Books without a second login. The connected system can only read the compliance summary and sign in
        people who already have access here.
      </p>

      {companies.length > 1 && (
        <Select value={companyId} onChange={(e) => setCompanyId(e.target.value)} className="mb-3 w-full">
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      )}

      <ul className="flex flex-col gap-2 text-sm mb-3">
        {connections?.map((c) => (
          <li key={c.id} className="flex items-center justify-between gap-3 border border-border rounded-lg px-3 py-2">
            <div>
              <div className={c.revokedAt ? "text-muted line-through" : ""}>{c.label}</div>
              <div className="text-xs text-muted font-mono">
                {c.keyPrefix}… · {c.revokedAt ? "revoked" : c.lastUsedAt ? `last used ${new Date(c.lastUsedAt).toLocaleString()}` : "never used"}
              </div>
            </div>
            {!c.revokedAt && (
              <Button variant="ghost" size="sm" className="!text-danger" onClick={() => revoke(c.id)}>
                Revoke
              </Button>
            )}
          </li>
        ))}
      </ul>

      {newKey && (
        <div className="bg-warning-surface border border-warning-border rounded-lg p-3 mb-3 text-xs text-warning-foreground">
          <p className="font-semibold mb-1">Copy this key now — it won&apos;t be shown again.</p>
          <p className="mb-2">Paste it into the Tax &amp; Compliance settings of your billing dashboard.</p>
          <code className="block break-all bg-surface text-foreground rounded p-2 font-mono">{newKey}</code>
          <button onClick={copyKey} className="mt-2 underline font-medium">
            {copied ? "Copied" : "Copy key"}
          </button>
        </div>
      )}

      <form onSubmit={create} className="flex gap-2">
        <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label" required maxLength={100} className="flex-1" />
        <Button type="submit" disabled={busy || !companyId}>
          {busy ? "Creating…" : "Create key"}
        </Button>
      </form>
      {error && <p className="text-danger text-sm mt-3">{error}</p>}
    </Card>
  );
}
