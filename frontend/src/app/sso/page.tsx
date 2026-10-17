"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, ApiError, setToken } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button, Input } from "@/components/ui";

/**
 * Landing page for "Open Netwave Books" from a connected system (e.g. the Netwave billing
 * dashboard). The single-use code arrives in the URL fragment, which browsers never send
 * to a server or in a Referer header; it is read once and wiped from the address bar.
 */
export default function SsoPage() {
  const [code, setCode] = useState<string | null>(null);
  const [needsMfa, setNeedsMfa] = useState(false);
  const [totpCode, setTotpCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const started = useRef(false);
  const { setAccessToken } = useAuth();
  const router = useRouter();

  async function exchange(ssoCode: string, totp?: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ accessToken: string; companyId: string }>("/auth/sso/exchange", { code: ssoCode, ...(totp ? { totpCode: totp } : {}) });
      setAccessToken(res.accessToken);
      router.replace(`/companies/${res.companyId}`);
    } catch (err) {
      if (err instanceof ApiError && /MFA code/i.test(err.message)) {
        setNeedsMfa(true);
        setError(/Invalid/i.test(err.message) ? "That code didn't match. Try again." : null);
      } else {
        setError(err instanceof ApiError ? err.message : "Sign-in failed.");
      }
      setBusy(false);
    }
  }

  function begin() {
    const fragmentCode = new URLSearchParams(window.location.hash.slice(1)).get("code");
    window.history.replaceState(null, "", window.location.pathname);
    if (!fragmentCode) {
      setError("This sign-in link is missing its code. Open Netwave Books again from your dashboard.");
      return;
    }
    // Drop any session left over from a different account before signing in as this one.
    setToken(null);
    setCode(fragmentCode);
    exchange(fragmentCode);
  }

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    begin();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="max-w-sm mx-auto mt-16 px-4">
      <h1 className="text-xl font-semibold tracking-tight mb-6">Signing you in…</h1>
      {needsMfa && code && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            exchange(code, totpCode);
          }}
          className="flex flex-col gap-3"
        >
          <p className="text-sm text-muted">Your account uses two-factor authentication. Enter the code from your authenticator app.</p>
          <Input inputMode="numeric" autoComplete="one-time-code" placeholder="6-digit code" value={totpCode} onChange={(e) => setTotpCode(e.target.value)} required autoFocus />
          <Button type="submit" disabled={busy}>
            {busy ? "Verifying…" : "Continue"}
          </Button>
        </form>
      )}
      {!needsMfa && busy && <p className="text-sm text-muted">Connecting to Netwave Books…</p>}
      {error && (
        <div className="mt-3">
          <p className="text-danger text-sm">{error}</p>
          {!needsMfa && (
            <Link href="/login" className="text-sm text-primary hover:underline mt-3 inline-block">
              Log in with your password instead
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
