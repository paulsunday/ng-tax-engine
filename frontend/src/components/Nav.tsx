"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth";

export function Nav() {
  const { claims, logout } = useAuth();

  return (
    <nav className="border-b border-gray-200 dark:border-gray-800 px-6 py-3 flex items-center justify-between">
      <div className="flex items-center gap-6">
        <Link href="/" className="font-semibold text-sm">
          NG Tax Engine
        </Link>
        {claims?.organizationId && (
          <>
            <Link href="/" className="text-sm text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white">
              Companies
            </Link>
          </>
        )}
      </div>
      <div className="flex items-center gap-4 text-sm">
        {claims ? (
          <>
            <span className="text-gray-500">
              {claims.email}
              {claims.roleName ? ` · ${claims.roleName}` : ""}
            </span>
            {!claims.organizationId && (
              <Link href="/select-organization" className="text-blue-600 hover:underline">
                Select organization
              </Link>
            )}
            <button onClick={logout} className="text-red-600 hover:underline">
              Log out
            </button>
          </>
        ) : (
          <Link href="/login" className="text-blue-600 hover:underline">
            Log in
          </Link>
        )}
      </div>
    </nav>
  );
}
