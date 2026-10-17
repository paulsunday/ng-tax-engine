"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import { Button, Input } from "@/components/ui";

interface InspectResult {
  organizationName: string;
  invitedByName: string;
  roleName: string;
  maskedEmail: string;
  requiresPassword: boolean;
}

function roleDisplayName(roleName: string): string {
  return roleName
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// Read once, synchronously, as React's recommended lazy-initial-state pattern — not inside
// a useEffect — so deriving "is there even a token" never needs a setState-in-effect call.
// The token travels in the URL FRAGMENT (#token=...), never the query string or path: a
// fragment is never sent to the server on page load and never appears in a Referer header,
// so it can't leak into server access logs.
function readTokenFromFragment(): string | null {
  if (typeof window === "undefined") return null;
  const match = window.location.hash.match(/token=([^&]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

export default function AcceptInvitePage() {
  const router = useRouter();
  const [token] = useState(readTokenFromFragment);
  const [inspection, setInspection] = useState<InspectResult | null>(null);
  const [error, setError] = useState<string | null>(() => (token ? null : "This invitation link is missing its token."));
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Strip the token from the visible address bar immediately so it doesn't linger in
  // browser history or a screenshot — a pure side effect on an external system (the
  // browser's own URL bar), not state derivation, so it belongs in an effect.
  useEffect(() => {
    window.history.replaceState(null, "", window.location.pathname);
  }, []);

  useEffect(() => {
    if (!token) return;
    api
      .post<InspectResult>("/auth/invitations/inspect", { token })
      .then(setInspection)
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : "This invitation link is invalid, expired, or has already been used.")
      );
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setError(null);
    setIsSubmitting(true);
    try {
      await api.post("/auth/invitations/accept", {
        token,
        fullName: inspection?.requiresPassword ? fullName : undefined,
        password: inspection?.requiresPassword ? password : undefined,
      });
      router.push("/login?accepted=1");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to accept the invitation.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="max-w-sm mx-auto mt-16 px-4">
      <h1 className="text-xl font-semibold tracking-tight mb-6">Accept invitation</h1>

      {!inspection && !error && <p className="text-sm text-muted">Checking your invitation…</p>}

      {error && (
        <>
          <p className="text-danger text-sm mb-4">{error}</p>
          <Link href="/login" className="text-primary hover:underline text-sm font-medium">
            Go to login
          </Link>
        </>
      )}

      {inspection && !error && (
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <p className="text-sm text-muted mb-1">
            You&apos;ve been invited to join <strong className="text-foreground">{inspection.organizationName}</strong> as{" "}
            <strong className="text-foreground">{roleDisplayName(inspection.roleName)}</strong>, by {inspection.invitedByName}.
          </p>
          <p className="text-xs text-muted mb-2">Invitation sent to {inspection.maskedEmail}.</p>

          {inspection.requiresPassword && (
            <>
              <div className="flex flex-col gap-1">
                <label htmlFor="accept-name" className="text-xs font-medium text-muted">
                  Full name
                </label>
                <Input id="accept-name" type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Your name" required />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="accept-password" className="text-xs font-medium text-muted">
                  Set a password
                </label>
                <Input
                  id="accept-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={10}
                />
              </div>
            </>
          )}

          {error && <p className="text-danger text-sm">{error}</p>}
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Joining…" : "Accept invitation"}
          </Button>
        </form>
      )}
    </div>
  );
}
