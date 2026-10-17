"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button, Input } from "@/components/ui";

export default function RegisterPage() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { setAccessToken } = useAuth();
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!acceptedTerms) {
      setError("You must accept the Terms & Conditions to register.");
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await api.post<{ accessToken: string }>("/auth/register", {
        fullName,
        email,
        password,
        organizationName,
        acceptedTerms,
      });
      setAccessToken(res.accessToken);
      router.push("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Registration failed.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="max-w-sm mx-auto mt-16 px-4">
      <h1 className="text-xl font-semibold tracking-tight mb-6">Create your workspace</h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <Input type="text" placeholder="Full name" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
        <Input type="text" placeholder="Organization name" value={organizationName} onChange={(e) => setOrganizationName(e.target.value)} required />
        <Input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <Input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />

        <label className="flex items-start gap-2 text-sm text-muted mt-1">
          <input type="checkbox" checked={acceptedTerms} onChange={(e) => setAcceptedTerms(e.target.checked)} className="mt-0.5 accent-primary" />
          <span>
            I have read and accept the{" "}
            <Link href="/terms" target="_blank" className="text-primary hover:underline">
              Terms &amp; Conditions
            </Link>{" "}
            on behalf of the company being registered.
          </span>
        </label>

        {error && <p className="text-danger text-sm">{error}</p>}
        <Button type="submit" disabled={isSubmitting || !acceptedTerms}>
          {isSubmitting ? "Creating…" : "Create workspace"}
        </Button>
      </form>
      <p className="text-sm text-muted mt-4">
        Already have an account?{" "}
        <Link href="/login" className="text-primary hover:underline font-medium">
          Log in
        </Link>
      </p>
    </div>
  );
}
