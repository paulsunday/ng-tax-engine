"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth";

function Logomark() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" className="text-primary" aria-hidden>
      <rect x="2" y="2" width="20" height="20" rx="6" fill="currentColor" />
      <path d="M8.5 16V8L15.5 16V8" stroke="var(--color-primary-foreground)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
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
    <nav className="sticky top-0 z-10 border-b border-border bg-surface/90 backdrop-blur shadow-sm">
      <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-7">
          <Link href="/" className="flex items-center gap-2 font-semibold text-sm text-foreground">
            <Logomark />
            Netwave Books
          </Link>
          {claims?.organizationId && <NavLink href="/">Companies</NavLink>}
          {claims?.organizationId && <NavLink href="/settings/team">Team</NavLink>}
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
      </div>
    </nav>
  );
}
