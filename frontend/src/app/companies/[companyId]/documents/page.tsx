"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { api, apiUpload, ApiError } from "@/lib/api";
import { RequireAuth } from "@/components/RequireAuth";
import { CompanySubNav } from "@/components/CompanySubNav";

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
    <div className="max-w-3xl mx-auto mt-10 px-4 pb-16">
      <CompanySubNav companyId={companyId} active="Documents" />
      <h1 className="text-lg font-semibold mb-4">Documents</h1>

      <form onSubmit={handleUpload} className="border rounded p-4 mb-6 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">File</label>
          <input ref={fileInputRef} type="file" className="text-sm" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">Category</label>
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="border rounded px-3 py-2 text-sm">
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{c.replaceAll("_", " ")}</option>
            ))}
          </select>
        </div>
        <button type="submit" disabled={uploading} className="bg-black text-white rounded px-3 py-2 text-sm disabled:opacity-50">
          {uploading ? "Uploading…" : "Upload"}
        </button>
      </form>

      {error && <p className="text-red-600 text-sm mb-3">{error}</p>}
      {notice && <p className="text-gray-700 text-sm mb-3">{notice}</p>}

      {documents?.length === 0 && <p className="text-sm text-gray-500">No documents yet.</p>}
      <ul className="flex flex-col gap-2 text-sm">
        {documents?.map((doc) => (
          <li key={doc.id} className="border rounded px-4 py-3">
            <div className="flex justify-between items-center">
              <div>
                <span className="font-medium">{doc.fileName}</span>{" "}
                <span className="text-gray-500">· {doc.category.replaceAll("_", " ")} · {(doc.sizeBytes / 1024).toFixed(0)} KB</span>
              </div>
              <span className="text-xs px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-800">{doc.ocrStatus}</span>
            </div>
            {doc.ocrStatus === "PENDING" && (
              <button onClick={() => runExtraction(doc.id)} disabled={busyId === doc.id} className="text-blue-600 hover:underline text-xs mt-2 disabled:opacity-50">
                {busyId === doc.id ? "Extracting…" : "Run OCR extraction"}
              </button>
            )}
            {doc.ocrStatus === "COMPLETED" && doc.ocrExtractedData?.fields && (
              <pre className="text-xs bg-gray-50 dark:bg-gray-900 p-2 rounded mt-2 overflow-x-auto">{JSON.stringify(doc.ocrExtractedData.fields, null, 2)}</pre>
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
