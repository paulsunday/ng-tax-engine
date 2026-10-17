"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { api, apiUpload, ApiError } from "@/lib/api";
import { RequireAuth } from "@/components/RequireAuth";
import { CompanySubNav } from "@/components/CompanySubNav";
import { Badge, Button, EmptyState, PageHeader, Select } from "@/components/ui";

const CATEGORIES = ["INVOICE", "RECEIPT", "CONTRACT", "BANK_STATEMENT", "PAYROLL", "ASSET_PURCHASE", "TAX", "PAYMENT_EVIDENCE", "SUPPLIER", "CUSTOMER", "OTHER"];

interface Document {
  id: string;
  fileName: string;
  category: string;
  ocrStatus: string;
  sizeBytes: number;
  createdAt: string;
  ocrExtractedData?: { fields?: Record<string, unknown> } | null;
}

function DocumentsPage() {
  const { companyId } = useParams<{ companyId: string }>();
  const [documents, setDocuments] = useState<Document[] | null>(null);
  const [category, setCategory] = useState("OTHER");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function reload() {
    api.get<Document[]>(`/companies/${companyId}/documents`).then(setDocuments).catch(() => setDocuments([]));
  }
  useEffect(reload, [companyId]);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setError("Choose a file first.");
      return;
    }
    setError(null);
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("category", category);
      await apiUpload(`/companies/${companyId}/documents/upload`, formData);
      if (fileInputRef.current) fileInputRef.current.value = "";
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function runExtraction(documentId: string) {
    setBusyId(documentId);
    setError(null);
    setNotice(null);
    try {
      await api.post(`/companies/${companyId}/documents/${documentId}/extract`);
      setNotice("Extraction complete — see the fields below.");
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Extraction failed — see the document's status.");
      reload();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="max-w-6xl mx-auto mt-10 px-6 pb-16">
      <CompanySubNav companyId={companyId} active="Documents" />
      <PageHeader title="Documents" />

      <form onSubmit={handleUpload} className="bg-surface border border-border rounded-xl p-5 mb-6 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted">File</label>
          <input ref={fileInputRef} type="file" className="text-sm" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted">Category</label>
          <Select value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c.replaceAll("_", " ")}
              </option>
            ))}
          </Select>
        </div>
        <Button type="submit" disabled={uploading}>
          {uploading ? "Uploading…" : "Upload"}
        </Button>
      </form>

      {error && <p className="text-danger text-sm mb-3">{error}</p>}
      {notice && <p className="text-muted text-sm mb-3">{notice}</p>}

      {documents?.length === 0 && <EmptyState>No documents yet.</EmptyState>}
      <ul className="flex flex-col gap-2 text-sm">
        {documents?.map((doc) => (
          <li key={doc.id} className="bg-surface border border-border rounded-xl px-4 py-3">
            <div className="flex justify-between items-center gap-3">
              <div>
                <span className="font-medium">{doc.fileName}</span>{" "}
                <span className="text-muted">
                  · {doc.category.replaceAll("_", " ")} · {(doc.sizeBytes / 1024).toFixed(0)} KB
                </span>
              </div>
              <Badge>{doc.ocrStatus}</Badge>
            </div>
            {doc.ocrStatus === "PENDING" && (
              <button onClick={() => runExtraction(doc.id)} disabled={busyId === doc.id} className="text-primary hover:underline text-xs mt-2 disabled:opacity-50">
                {busyId === doc.id ? "Extracting…" : "Run OCR extraction"}
              </button>
            )}
            {doc.ocrStatus === "COMPLETED" && doc.ocrExtractedData?.fields && (
              <pre className="text-xs bg-surface-muted p-2 rounded-lg mt-2 overflow-x-auto">{JSON.stringify(doc.ocrExtractedData.fields, null, 2)}</pre>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function Page() {
  return (
    <RequireAuth>
      <DocumentsPage />
    </RequireAuth>
  );
}
