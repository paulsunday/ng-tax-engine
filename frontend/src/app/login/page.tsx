"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { DisclaimerBanner } from "@/components/DisclaimerBanner";

interface LoginResponse {
  accessToken: string;
  requiresOrganizationSelection: boolean;
  organizations: { organizationId: string; organizationName: string; roleName: string }[];
}

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [needsMfa, setNeedsMfa] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { setAccessToken } = useAuth();
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const res = await api.post<LoginResponse>("/auth/login", {
        email,
        password,
        ...(totpCode ? { totpCode } : {}),
      });
      setAccessToken(res.accessToken);
      if (res.requiresOrganizationSelection) {
        router.push("/select-organization");
      } else {
        router.push("/");
      }
    } catch (err) {
      if (err instanceof ApiError && /MFA code required/i.test(err.message)) {
        setNeedsMfa(true);
        setError("Enter your MFA code to continue.");
      } else {
        setError(err instanceof ApiError ? err.message : "Login failed.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
    <DisclaimerBanner />
    <div className="max-w-sm mx-auto mt-16 px-4">
      <h1 className="text-lg font-semibold mb-6">Log in</h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="border rounded px-3 py-2 text-sm"
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="border rounded px-3 py-2 text-sm"
        />
        {needsMfa && (
          <input
            type="text"
            placeholder="6-digit MFA code"
            value={totpCode}
            onChange={(e) => setTotpCode(e.target.value)}
            className="border rounded px-3 py-2 text-sm"
          />
        )}
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <button
          type="submit"
          disabled={isSubmitting}
          className="bg-black text-white rounded px-3 py-2 text-sm disabled:opacity-50"
        >
          {isSubmitting ? "Logging in…" : "Log in"}
        </button>
      </form>
      <p className="text-sm text-gray-500 mt-4">
        No account?{" "}
        <Link href="/register" className="text-blue-600 hover:underline">
          Register
        </Link>
      </p>
    </div>
    </>
  );
}
