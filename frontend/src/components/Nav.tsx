"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth";

function Logomark() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" className="text-primary" aria-hidden>
      <rect x="2" y="2" width="20" height="20" rx="6" fill="currentColor" />
      <path d="M7 15.5V8.5L13 15.5V8.5" stroke="var(--color-primary-foreground)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M15.5 8.5h2.3" stroke="var(--color-primary-foreground)" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M16.65 8.5v7" stroke="var(--color-primary-foreground)" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="text-sm text-muted hover:text-foreground transition-colors">
      {children}
    </Link>
  );
}

export function Nav() {
  const { claims, logout } = useAuth();

  return (
    <nav className="sticky top-0 z-10 border-b border-border bg-surface/80 backdrop-blur px-6 py-3 flex items-center justify-between">
      <div className="flex items-center gap-7">
        <Link href="/" className="flex items-center gap-2 font-semibold text-sm text-foreground">
          <Logomark />
          NG Tax Engine
        </Link>
        {claims?.organizationId && <NavLink href="/">Companies</NavLink>}
        {(claims?.isPlatformAdmin || claims?.isTaxRuleApprover) && <NavLink href="/admin/tax-rules">Tax Rules</NavLink>}
      </div>
      <div className="flex items-center gap-5 text-sm">
        {claims ? (
          <>
            <span className="text-muted hidden sm:inline">
              {claims.email}
              {claims.roleName ? ` · ${claims.roleName}` : ""}
            </span>
            {!claims.organizationId && (
              <Link href="/select-organization" className="text-primary hover:underline font-medium">
                Select organization
              </Link>
            )}
            <NavLink href="/settings">Settings</NavLink>
            <button onClick={logout} className="text-danger hover:underline">
              Log out
            </button>
          </>
        ) : (
          <Link href="/login" className="text-primary hover:underline font-medium">
            Log in
          </Link>
        )}
      </div>
    </nav>
  );
}
